import { Kind } from "nostr-tools";

import NostrRequest from "../classes/nostr-request";
import Subject from "../classes/subject";
import SuperMap from "../classes/super-map";
import { NostrEvent, isATag, isETag } from "../types/nostr-event";
import { NostrRequestFilter } from "../types/nostr-query";
import { isHexKey } from "../helpers/nip19";

type eventUID = string;
type relay = string;

class EventZapsService {
  subjects = new SuperMap<eventUID, Subject<NostrEvent[]>>(() => new Subject<NostrEvent[]>([]));
  pending = new SuperMap<eventUID, Set<relay>>(() => new Set());

  requestZaps(eventUID: eventUID, relays: relay[], alwaysRequest = true) {
    const subject = this.subjects.get(eventUID);

    if (!subject.value || alwaysRequest) {
      for (const relay of relays) {
        this.pending.get(eventUID).add(relay);
      }
    }

    return subject;
  }

  handleEvent(event: NostrEvent) {
    if (event.kind !== Kind.Zap) return;
    const eventUID = event.tags.find(isETag)?.[1] ?? event.tags.find(isATag)?.[1];
    if (!eventUID) return;

    const subject = this.subjects.get(eventUID);
    if (!subject.value) {
      subject.next([event]);
    } else if (!subject.value.some((e) => e.id === event.id)) {
      subject.next([...subject.value, event]);
    }
  }

  batchRequests() {
    if (this.pending.size === 0) return;

    const idsFromRelays: Record<relay, eventUID[]> = {};
    for (const [id, relays] of this.pending) {
      for (const relay of relays) {
        idsFromRelays[relay] = idsFromRelays[relay] ?? [];
        idsFromRelays[relay].push(id);
      }
    }

    for (const [relay, ids] of Object.entries(idsFromRelays)) {
      const request = new NostrRequest([relay]);
      request.onEvent.subscribe(this.handleEvent, this);
      const eventIds = ids.filter(isHexKey);
      const coordinates = ids.filter((id) => id.includes(":"));

      const queries: NostrRequestFilter = [];
      if (eventIds.length > 0) {
        queries.push({ "#e": eventIds, kinds: [Kind.Zap] });
      }
      if (coordinates.length > 0) {
        queries.push({ "#a": coordinates, kinds: [Kind.Zap] });
      }

      request.start(queries);
    }
    this.pending.clear();
  }
}

const eventZapsService = new EventZapsService();

if (import.meta.env.DEV) {
  // @ts-ignore
  window.eventZapsService = eventZapsService;
}

setInterval(() => {
  eventZapsService.batchRequests();
}, 1000 * 2);

export default eventZapsService;
