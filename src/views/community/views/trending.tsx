import { useMemo } from "react";
import { useOutletContext } from "react-router-dom";

import {
  COMMUNITY_APPROVAL_KIND,
  buildApprovalMap,
  getCommunityMods,
  getCommunityPostVote,
  getCommunityRelays,
} from "../../../helpers/nostr/communities";
import useSubject from "../../../hooks/use-subject";
import { useTimelineCurserIntersectionCallback } from "../../../hooks/use-timeline-cursor-intersection-callback";
import IntersectionObserverProvider from "../../../providers/intersection-observer";
import TimelineActionAndStatus from "../../../components/timeline-page/timeline-action-and-status";
import useUserMuteFilter from "../../../hooks/use-user-mute-filter";
import useEventsReactions from "../../../hooks/use-events-reactions";
import { groupReactions } from "../../../helpers/nostr/reactions";
import ApprovedEvent from "../components/community-approved-post";
import { RouterContext } from "../community-home";

export default function CommunityTrendingView() {
  const { community, timeline } = useOutletContext<RouterContext>();
  const muteFilter = useUserMuteFilter();
  const mods = getCommunityMods(community);

  const events = useSubject(timeline.timeline);
  const approvalMap = buildApprovalMap(events, mods);

  const approved = events
    .filter((e) => e.kind !== COMMUNITY_APPROVAL_KIND && approvalMap.has(e.id))
    .map((event) => ({ event, approvals: approvalMap.get(event.id) }))
    .filter((e) => !muteFilter(e.event));

  // fetch votes for approved posts
  const eventReactions = useEventsReactions(
    approved.map((e) => e.event.id),
    getCommunityRelays(community),
  );
  const eventVotes = useMemo(() => {
    const dir: Record<string, number> = {};
    for (const [id, reactions] of Object.entries(eventReactions)) {
      const grouped = groupReactions(reactions);
      const { vote } = getCommunityPostVote(grouped);
      dir[id] = vote;
    }
    return dir;
  }, [eventReactions]);

  const sorted = approved.sort((a, b) => (eventVotes[b.event.id] ?? 0) - (eventVotes[a.event.id] ?? 0));

  const callback = useTimelineCurserIntersectionCallback(timeline);

  return (
    <>
      <IntersectionObserverProvider callback={callback}>
        {sorted.map(({ event, approvals }) => (
          <ApprovedEvent key={event.id} event={event} approvals={approvals ?? []} />
        ))}
      </IntersectionObserverProvider>
      <TimelineActionAndStatus timeline={timeline} />
    </>
  );
}
