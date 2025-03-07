import { useMemo } from "react";
import { nip19 } from "nostr-tools";

import { RelayMode } from "../classes/relay";
import relayScoreboardService from "../services/relay-scoreboard";
import { useUserRelays } from "./use-user-relays";

export function useSharableProfileId(pubkey: string, relayCount = 2) {
  const userRelays = useUserRelays(pubkey);

  return useMemo(() => {
    const writeUrls = userRelays.filter((r) => r.mode & RelayMode.WRITE).map((r) => r.url);
    const ranked = relayScoreboardService.getRankedRelays(writeUrls);
    const onlyTwo = ranked.slice(0, relayCount);

    return onlyTwo.length > 0 ? nip19.nprofileEncode({ pubkey, relays: onlyTwo }) : nip19.npubEncode(pubkey);
  }, [userRelays]);
}
