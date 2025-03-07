import { Kind, nip19 } from "nostr-tools";
import { Box, Card, CardBody, CardHeader, Flex, LinkBox, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "react-router-dom";

import useTimelineLoader from "../../hooks/use-timeline-loader";
import RelaySelectionProvider, { useRelaySelectionContext } from "../../providers/relay-selection-provider";
import useSubject from "../../hooks/use-subject";
import { useTimelineCurserIntersectionCallback } from "../../hooks/use-timeline-cursor-intersection-callback";
import VerticalPageLayout from "../../components/vertical-page-layout";
import IntersectionObserverProvider from "../../providers/intersection-observer";
import { NostrEvent } from "../../types/nostr-event";
import { ErrorBoundary } from "../../components/error-boundary";
import RelaySelectionButton from "../../components/relay-selection/relay-selection-button";
import { useCallback, useRef } from "react";
import useClientSideMuteFilter from "../../hooks/use-client-side-mute-filter";
import PeopleListProvider, { usePeopleListContext } from "../../providers/people-list-provider";
import PeopleListSelection from "../../components/people-list-selection/people-list-selection";
import ChannelCard from "./components/channel-card";

function ChannelsHomePage() {
  const { relays } = useRelaySelectionContext();
  const { filter, listId } = usePeopleListContext();

  const clientMuteFilter = useClientSideMuteFilter();
  const eventFilter = useCallback(
    (e: NostrEvent) => {
      if (clientMuteFilter(e)) return false;
      return true;
    },
    [clientMuteFilter],
  );
  const timeline = useTimelineLoader(
    `${listId}-channels`,
    relays,
    filter ? { ...filter, kinds: [Kind.ChannelCreation] } : undefined,
    { eventFilter },
  );
  const channels = useSubject(timeline.timeline);

  const callback = useTimelineCurserIntersectionCallback(timeline);

  return (
    <VerticalPageLayout>
      <Flex gap="2">
        <PeopleListSelection />
        <RelaySelectionButton />
      </Flex>
      <IntersectionObserverProvider callback={callback}>
        {channels.map((channel) => (
          <ErrorBoundary key={channel.id}>
            <ChannelCard channel={channel} additionalRelays={relays} />
          </ErrorBoundary>
        ))}
      </IntersectionObserverProvider>
    </VerticalPageLayout>
  );
}

export default function ChannelsHomeView() {
  return (
    <RelaySelectionProvider>
      <PeopleListProvider>
        <ChannelsHomePage />
      </PeopleListProvider>
    </RelaySelectionProvider>
  );
}
