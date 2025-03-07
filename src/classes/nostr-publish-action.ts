import { nanoid } from "nanoid";

import { isReplaceable } from "../helpers/nostr/events";
import relayPoolService from "../services/relay-pool";
import { NostrEvent } from "../types/nostr-event";
import createDefer from "./deferred";
import Relay, { IncomingCommandResult } from "./relay";
import Subject, { PersistentSubject } from "./subject";

import { addToLog } from "../services/publish-log";
import replaceableEventLoaderService from "../services/replaceable-event-requester";
import eventExistsService from "../services/event-exists";

export default class NostrPublishAction {
  id = nanoid();
  label: string;
  relays: string[];
  event: NostrEvent;

  results = new PersistentSubject<IncomingCommandResult[]>([]);
  onResult = new Subject<IncomingCommandResult>(undefined, false);
  onComplete = createDefer<IncomingCommandResult[]>();

  private remaining = new Set<Relay>();

  constructor(label: string, relays: string[], event: NostrEvent, timeout: number = 5000) {
    this.label = label;
    this.relays = relays;
    this.event = event;

    for (const url of relays) {
      const relay = relayPoolService.requestRelay(url);
      this.remaining.add(relay);
      relay.onCommandResult.subscribe(this.handleResult, this);

      // send event
      relay.send(["EVENT", event]);
    }

    setTimeout(this.handleTimeout.bind(this), timeout);

    addToLog(this);

    // if this is replaceable, mirror it over to the replaceable event service
    if (isReplaceable(event.kind)) {
      replaceableEventLoaderService.handleEvent(event);
    }

    // pass the event along to the eventExistsService
    eventExistsService.handleEvent(event);
  }

  private handleResult(result: IncomingCommandResult) {
    if (result.eventId === this.event.id) {
      const relay = result.relay;
      this.results.next([...this.results.value, result]);

      this.onResult.next(result);

      relay.onCommandResult.unsubscribe(this.handleResult, this);
      this.remaining.delete(relay);
      if (this.remaining.size === 0) this.onComplete.resolve(this.results.value);
    }
  }

  private handleTimeout() {
    for (const relay of this.remaining) {
      this.handleResult({
        message: "Timeout",
        eventId: this.event.id,
        status: false,
        type: "OK",
        relay,
      });
    }
  }
}
