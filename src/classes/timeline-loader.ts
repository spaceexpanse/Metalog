import dayjs from "dayjs";
import { Debugger } from "debug";

import { NostrEvent, isATag, isETag } from "../types/nostr-event";
import { NostrRequestFilter, RelayQueryMap } from "../types/nostr-query";
import NostrRequest from "./nostr-request";
import NostrMultiSubscription from "./nostr-multi-subscription";
import Subject, { PersistentSubject } from "./subject";
import { logger } from "../helpers/debug";
import EventStore from "./event-store";
import { isReplaceable } from "../helpers/nostr/events";
import replaceableEventLoaderService from "../services/replaceable-event-requester";
import deleteEventService from "../services/delete-events";
import { addQueryToFilter, isFilterEqual, mapQueryMap } from "../helpers/nostr/filter";

const BLOCK_SIZE = 30;

export type EventFilter = (event: NostrEvent, store: EventStore) => boolean;

export class RelayBlockLoader {
  relay: string;
  filter: NostrRequestFilter;
  blockSize = BLOCK_SIZE;
  private log: Debugger;

  loading = false;
  events: EventStore;
  /** set to true when the next block produces 0 events */
  complete = false;

  onBlockFinish = new Subject<void>();

  constructor(relay: string, filter: NostrRequestFilter, log?: Debugger) {
    this.relay = relay;
    this.filter = filter;

    this.log = log || logger.extend(relay);
    this.events = new EventStore(relay);

    deleteEventService.stream.subscribe(this.handleDeleteEvent, this);
  }

  loadNextBlock() {
    this.loading = true;
    let filter: NostrRequestFilter = addQueryToFilter(this.filter, { limit: this.blockSize });
    let oldestEvent = this.getLastEvent();
    if (oldestEvent) {
      filter = addQueryToFilter(filter, { until: oldestEvent.created_at - 1 });
    }

    const request = new NostrRequest([this.relay]);

    let gotEvents = 0;
    request.onEvent.subscribe((e) => {
      this.handleEvent(e);
      gotEvents++;
    });
    request.onComplete.then(() => {
      this.loading = false;
      this.log(`Got ${gotEvents} events`);
      if (gotEvents === 0) {
        this.complete = true;
        this.log("Complete");
      }
      this.onBlockFinish.next();
    });

    request.start(filter);
  }

  private handleEvent(event: NostrEvent) {
    return this.events.addEvent(event);
  }

  private handleDeleteEvent(deleteEvent: NostrEvent) {
    const cord = deleteEvent.tags.find(isATag)?.[1];
    const eventId = deleteEvent.tags.find(isETag)?.[1];

    if (cord) this.events.deleteEvent(cord);
    if (eventId) this.events.deleteEvent(eventId);
  }

  cleanup() {
    deleteEventService.stream.unsubscribe(this.handleDeleteEvent, this);
  }

  getFirstEvent(nth = 0, eventFilter?: EventFilter) {
    return this.events.getFirstEvent(nth, eventFilter);
  }
  getLastEvent(nth = 0, eventFilter?: EventFilter) {
    return this.events.getLastEvent(nth, eventFilter);
  }
}

export default class TimelineLoader {
  cursor = dayjs().unix();
  queryMap: RelayQueryMap = {};

  events: EventStore;
  timeline = new PersistentSubject<NostrEvent[]>([]);
  loading = new PersistentSubject(false);
  complete = new PersistentSubject(false);

  loadNextBlockBuffer = 2;
  eventFilter?: EventFilter;

  name: string;
  private log: Debugger;
  private subscription: NostrMultiSubscription;

  private blockLoaders = new Map<string, RelayBlockLoader>();

  constructor(name: string) {
    this.name = name;
    this.log = logger.extend("TimelineLoader:" + name);
    this.events = new EventStore(name);

    this.subscription = new NostrMultiSubscription(name);
    this.subscription.onEvent.subscribe(this.handleEvent, this);

    // update the timeline when there are new events
    this.events.onEvent.subscribe(this.updateTimeline, this);
    this.events.onDelete.subscribe(this.updateTimeline, this);
    this.events.onClear.subscribe(this.updateTimeline, this);

    deleteEventService.stream.subscribe(this.handleDeleteEvent, this);
  }

  private updateTimeline() {
    if (this.eventFilter) {
      const filter = this.eventFilter;
      this.timeline.next(this.events.getSortedEvents().filter((e) => filter(e, this.events)));
    } else this.timeline.next(this.events.getSortedEvents());
  }
  private handleEvent(event: NostrEvent) {
    // if this is a replaceable event, mirror it over to the replaceable event service
    if (isReplaceable(event.kind)) {
      replaceableEventLoaderService.handleEvent(event);
    }
    this.events.addEvent(event);
  }
  private handleDeleteEvent(deleteEvent: NostrEvent) {
    const cord = deleteEvent.tags.find(isATag)?.[1];
    const eventId = deleteEvent.tags.find(isETag)?.[1];

    if (cord) this.events.deleteEvent(cord);
    if (eventId) this.events.deleteEvent(eventId);
  }

  private connectToBlockLoader(loader: RelayBlockLoader) {
    this.events.connect(loader.events);
    loader.onBlockFinish.subscribe(this.updateLoading, this);
    loader.onBlockFinish.subscribe(this.updateComplete, this);
  }
  private disconnectToBlockLoader(loader: RelayBlockLoader) {
    loader.cleanup();
    this.events.disconnect(loader.events);
    loader.onBlockFinish.unsubscribe(this.updateLoading, this);
    loader.onBlockFinish.unsubscribe(this.updateComplete, this);
  }

  setQueryMap(queryMap: RelayQueryMap) {
    if (isFilterEqual(this.queryMap, queryMap)) return;

    this.log("set query map", queryMap);

    // remove relays
    for (const relay of Object.keys(this.queryMap)) {
      const loader = this.blockLoaders.get(relay);
      if (!loader) continue;
      if (!queryMap[relay]) {
        this.disconnectToBlockLoader(loader);
        this.blockLoaders.delete(relay);
      }
    }

    for (const [relay, filter] of Object.entries(queryMap)) {
      // remove outdated loaders
      if (this.queryMap[relay] && !isFilterEqual(this.queryMap[relay], filter)) {
        const old = this.blockLoaders.get(relay)!;
        this.disconnectToBlockLoader(old);
        this.blockLoaders.delete(relay);
      }

      if (!this.blockLoaders.has(relay)) {
        const loader = new RelayBlockLoader(relay, filter, this.log.extend(relay));
        this.blockLoaders.set(relay, loader);
        this.connectToBlockLoader(loader);
      }
    }

    this.queryMap = queryMap;

    // update the subscription query map and add limit
    this.subscription.setQueryMap(
      mapQueryMap(this.queryMap, (filter) => addQueryToFilter(filter, { limit: BLOCK_SIZE / 2 })),
    );

    this.triggerBlockLoads();
  }

  setEventFilter(filter?: EventFilter) {
    this.eventFilter = filter;
    this.updateTimeline();
  }
  setCursor(cursor: number) {
    this.cursor = cursor;
    this.triggerBlockLoads();
  }

  triggerBlockLoads() {
    let triggeredLoad = false;
    for (const [relay, loader] of this.blockLoaders) {
      if (loader.complete || loader.loading) continue;
      const event = loader.getLastEvent(this.loadNextBlockBuffer, this.eventFilter);
      if (!event || event.created_at >= this.cursor) {
        loader.loadNextBlock();
        triggeredLoad = true;
      }
    }
    if (triggeredLoad) this.updateLoading();
  }
  loadNextBlock() {
    let triggeredLoad = false;
    for (const [relay, loader] of this.blockLoaders) {
      if (loader.complete || loader.loading) continue;
      loader.loadNextBlock();
      triggeredLoad = true;
    }
    if (triggeredLoad) this.updateLoading();
  }

  private updateLoading() {
    for (const [relay, loader] of this.blockLoaders) {
      if (loader.loading) {
        if (!this.loading.value) {
          this.loading.next(true);
          return;
        }
      }
    }
    if (this.loading.value) this.loading.next(false);
  }
  private updateComplete() {
    for (const [relay, loader] of this.blockLoaders) {
      if (!loader.complete) {
        this.complete.next(false);
        return;
      }
    }
    return this.complete.next(true);
  }
  open() {
    this.subscription.open();
  }
  close() {
    this.subscription.close();
  }

  forgetEvents() {
    this.events.clear();
    this.timeline.next([]);
    this.subscription.forgetEvents();
  }
  reset() {
    this.cursor = dayjs().unix();
    for (const [_, loader] of this.blockLoaders) this.disconnectToBlockLoader(loader);
    this.blockLoaders.clear();
    this.forgetEvents();
  }

  /** close the subscription and remove any event listeners for this timeline */
  cleanup() {
    this.close();

    for (const [_, loader] of this.blockLoaders) this.disconnectToBlockLoader(loader);
    this.blockLoaders.clear();

    this.events.cleanup();

    deleteEventService.stream.unsubscribe(this.handleDeleteEvent, this);
  }
}
