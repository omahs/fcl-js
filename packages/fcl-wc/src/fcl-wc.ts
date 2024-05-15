import * as fcl from "@onflow/fcl"
import SignClient from "@walletconnect/sign-client"
import {invariant} from "@onflow/util-invariant"
import {LEVELS, log} from "@onflow/util-logger"
export {getSdkError} from "@walletconnect/utils"
import {makeServicePlugin} from "./service"
import {setConfiguredNetwork} from "./utils"
import {CoreTypes} from "@walletconnect/types"

const DEFAULT_RELAY_URL = "wss://relay.walletconnect.com"
const DEFAULT_LOGGER = "debug"
let client: SignClient | null = null

const initClient = async ({
  projectId,
  metadata,
}: {
  projectId: string
  metadata: CoreTypes.Metadata | undefined
}) => {
  invariant(
    projectId != null,
    "FCL Wallet Connect Error: WalletConnect projectId is required"
  )
  try {
    client = await SignClient.init({
      logger: DEFAULT_LOGGER,
      relayUrl: DEFAULT_RELAY_URL,
      projectId: projectId,
      metadata: metadata,
    })
    return client
  } catch (error) {
    if (error instanceof Error) {
      log({
        title: `${error.name} fcl-wc Init Client`,
        message: error.message,
        level: LEVELS.error,
      })
    }
    throw error
  }
}

export const init = async ({
  projectId,
  metadata,
  includeBaseWC = false,
  wcRequestHook = null,
  pairingModalOverride = null,
  wallets = [],
}: {
  projectId: string
  metadata: CoreTypes.Metadata | undefined
  includeBaseWC: boolean
  wcRequestHook: any
  pairingModalOverride: any
  wallets: any[]
}) => {
  await setConfiguredNetwork()
  const _client = client ?? (await initClient({projectId, metadata}))
  const FclWcServicePlugin = await makeServicePlugin(_client, {
    projectId,
    includeBaseWC,
    wcRequestHook,
    pairingModalOverride,
    wallets,
  })
  fcl.discovery.authn.update()

  return {
    FclWcServicePlugin,
    client,
  }
}