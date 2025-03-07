import { useFormContext } from "react-hook-form";
import {
  Flex,
  FormControl,
  FormLabel,
  Switch,
  AccordionItem,
  AccordionPanel,
  AccordionButton,
  Box,
  AccordionIcon,
  FormHelperText,
  Input,
  Link,
  FormErrorMessage,
  Code,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  useDisclosure,
  Text,
  Heading,
} from "@chakra-ui/react";
import { safeUrl } from "../../helpers/parse";
import { AppSettings } from "../../services/settings/migrations";
import { PerformanceIcon } from "../../components/icons";
import { useLocalStorage } from "react-use";
import { LOCAL_CACHE_RELAY } from "../../services/local-cache-relay";

export default function PerformanceSettings() {
  const { register, formState } = useFormContext<AppSettings>();
  const [localCacheRelay, setLocalCacheRelay] = useLocalStorage<boolean>("enable-cache-relay");
  const cacheDetails = useDisclosure();

  return (
    <AccordionItem>
      <h2>
        <AccordionButton fontSize="xl">
          <PerformanceIcon mr="2" />
          <Box as="span" flex="1" textAlign="left">
            Performance
          </Box>
          <AccordionIcon />
        </AccordionButton>
      </h2>
      <AccordionPanel>
        <Flex direction="column" gap="4">
          <FormControl>
            <Flex alignItems="center">
              <FormLabel htmlFor="proxy-user-media" mb="0">
                Proxy user media
              </FormLabel>
              <Switch id="proxy-user-media" {...register("proxyUserMedia")} />
            </Flex>
            <FormHelperText>
              <span>Enabled: Use media.nostr.band to get smaller profile pictures (saves ~50Mb of data)</span>
              <br />
              <span>Side Effect: Some user pictures may not load or may be outdated</span>
            </FormHelperText>
          </FormControl>
          <FormControl>
            <FormLabel htmlFor="imageProxy" mb="0">
              Image proxy service
            </FormLabel>
            <Input
              id="imageProxy"
              type="url"
              {...register("imageProxy", {
                setValueAs: (v) => safeUrl(v) || v,
              })}
            />
            {formState.errors.imageProxy && <FormErrorMessage>{formState.errors.imageProxy.message}</FormErrorMessage>}
            <FormHelperText>
              <span>
                A URL to an instance of{" "}
                <Link href="https://github.com/willnorris/imageproxy" isExternal target="_blank">
                  willnorris/imageproxy
                </Link>
              </span>
            </FormHelperText>
          </FormControl>
          <FormControl>
            <Flex alignItems="center">
              <FormLabel htmlFor="autoShowMedia" mb="0">
                Show embeds
              </FormLabel>
              <Switch id="autoShowMedia" {...register("autoShowMedia")} />
            </Flex>
            <FormHelperText>Disabled: Embeds will show an expandable button</FormHelperText>
          </FormControl>
          <FormControl>
            <Flex alignItems="center">
              <FormLabel htmlFor="showReactions" mb="0">
                Show reactions
              </FormLabel>
              <Switch id="showReactions" {...register("showReactions")} />
            </Flex>
            <FormHelperText>Enabled: Show reactions on notes</FormHelperText>
          </FormControl>
          <FormControl>
            <Flex alignItems="center">
              <FormLabel htmlFor="showSignatureVerification" mb="0">
                Show signature verification
              </FormLabel>
              <Switch id="showSignatureVerification" {...register("showSignatureVerification")} />
            </Flex>
            <FormHelperText>Enabled: show signature verification on notes</FormHelperText>
          </FormControl>
          <FormControl>
            <Flex alignItems="center">
              <FormLabel htmlFor="localCacheRelay" mb="0">
                Local Cache Relay
              </FormLabel>
              <Switch
                id="localCacheRelay"
                isChecked={localCacheRelay}
                onChange={(e) => setLocalCacheRelay(e.target.checked)}
              />
              <Button onClick={cacheDetails.onOpen} variant="link" ml="4">
                Details
              </Button>
            </Flex>
            <FormHelperText>Enabled: Use a local relay as a caching service</FormHelperText>

            <Modal isOpen={cacheDetails.isOpen} onClose={cacheDetails.onClose} size="4xl">
              <ModalOverlay />
              <ModalContent>
                <ModalHeader p="4">Local cache relay</ModalHeader>
                <ModalCloseButton />
                <ModalBody px="4" pb="4" pt="0">
                  <Text>
                    When this option is enabled noStrudel will mirror every event it sees to the relay. It will also try
                    to load as much data from the relay first before reaching out to other relays.
                  </Text>
                  <Text>
                    For security reasons noStrudel will only use <Code>ws://localhost:7000</Code> as the cache relay.
                  </Text>
                  <Heading size="md" mt="2">
                    Linux setup instructions
                  </Heading>
                  <Text>
                    You can run a local relay using{" "}
                    <Link href="https://www.docker.com/get-started/" isExternal>
                      docker
                    </Link>{" "}
                    and{" "}
                    <Link href="https://hub.docker.com/r/scsibug/nostr-rs-relay" isExternal>
                      nostr-rs-relay
                    </Link>
                  </Text>
                  <Text mt="2">1. Create a folder for the data</Text>
                  <Code>mkdir ~/.nostr-relay/data -p -m 777</Code>
                  <Text mt="2">2. Start the relay</Text>
                  <Code>
                    docker run --rm -it -p 7000:8080 -v ~/.nostr-relay/data:/usr/src/app/db scsibug/nostr-rs-relay
                  </Code>
                </ModalBody>
              </ModalContent>
            </Modal>
          </FormControl>
        </Flex>
      </AccordionPanel>
    </AccordionItem>
  );
}
