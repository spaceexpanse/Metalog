import { useCallback, useMemo } from "react";
import { Flex, Spacer, useDisclosure } from "@chakra-ui/react";
import { Kind } from "nostr-tools";

import { isReply, isRepost } from "../../../helpers/nostr/events";
import { useAppTitle } from "../../../hooks/use-app-title";
import useTimelineLoader from "../../../hooks/use-timeline-loader";
import { NostrEvent } from "../../../types/nostr-event";
import TimelinePage, { useTimelinePageEventFilter } from "../../../components/timeline-page";
import TimelineViewTypeButtons from "../../../components/timeline-page/timeline-view-type";
import PeopleListSelection from "../../../components/people-list-selection/people-list-selection";
import { usePeopleListContext } from "../../../providers/people-list-provider";
import { NostrRequestFilter } from "../../../types/nostr-query";
import useClientSideMuteFilter from "../../../hooks/use-client-side-mute-filter";
import NoteFilterTypeButtons from "../../../components/note-filter-type-buttons";

export default function RelayNotes({ relay }: { relay: string }) {
  useAppTitle(`${relay} - Notes`);
  const showReplies = useDisclosure();
  const showReposts = useDisclosure({ defaultIsOpen: true });

  const { filter } = usePeopleListContext();
  const kinds = [Kind.Text];

  const timelineEventFilter = useTimelinePageEventFilter();
  const muteFilter = useClientSideMuteFilter();
  const eventFilter = useCallback(
    (event: NostrEvent) => {
      if (muteFilter(event)) return false;
      if (!showReplies.isOpen && isReply(event)) return false;
      if (!showReposts.isOpen && isRepost(event)) return false;
      return timelineEventFilter(event);
    },
    [timelineEventFilter, showReplies.isOpen, showReposts.isOpen, muteFilter],
  );
  const timeline = useTimelineLoader(`${relay}-notes`, [relay], filter ? { ...filter, kinds } : undefined, {
    eventFilter,
  });

  const header = (
    <Flex gap="2" wrap="wrap" px={["2", 0]}>
      <PeopleListSelection />
      <NoteFilterTypeButtons showReplies={showReplies} showReposts={showReposts} />
      <Spacer />
      <TimelineViewTypeButtons />
    </Flex>
  );

  return <TimelinePage timeline={timeline} header={header} />;
}
