export {
  VERSION,
  query,
  verifyUserSignatures,
  serialize,
  tx,
  events,
  pluginRegistry,
  discovery,
  t,
  WalletUtils,
  AppUtils,
  InteractionTemplateUtils,
  getChainId,
  TestUtils,
  config,
  send,
  decode,
  account,
  block,
  isOk,
  isBad,
  why,
  pipe,
  build,
  withPrefix,
  sansPrefix,
  display,
  cadence,
  cdc,
  createSignableVoucher,
  voucherIntercept,
  voucherToTxId,
  transaction,
  script,
  ping,
  atBlockHeight,
  atBlockId,
  getAccount,
  getEvents,
  getEventsAtBlockHeightRange,
  getEventsAtBlockIds,
  getBlock,
  getBlockHeader,
  getCollection,
  getTransactionStatus,
  getTransaction,
  getNetworkParameters,
  getNodeVersionInfo,
  authorizations,
  authorization,
  args,
  arg,
  proposer,
  payer,
  limit,
  ref,
  params,
  param,
  validator,
  invariant,
  subscribeEvents,
  nodeVersionInfo,
} from "@onflow/fcl-core"

import {getMutate, getCurrentUser, initServiceRegistry} from "@onflow/fcl-core"

import {execStrategyHook} from "./discovery/exec-hook"
const discoveryOpts = {
  execStrategy: execStrategyHook,
}

export const mutate = getMutate({platform: "web", discovery: discoveryOpts})
export const currentUser = getCurrentUser({
  platform: "web",
  discovery: discoveryOpts,
})

export const authenticate = (opts = {}) => currentUser().authenticate(opts)
export const unauthenticate = () => currentUser().unauthenticate()
export const reauthenticate = (opts = {}) => {
  currentUser().unauthenticate()
  return currentUser().authenticate(opts)
}
export const signUp = (opts = {}) => currentUser().authenticate(opts)
export const logIn = (opts = {}) => currentUser().authenticate(opts)

export const authz = currentUser().authorization

import {config} from "@onflow/config"
import {getDefaultConfig, coreStrategies} from "./utils/web"
import {initFclWcLoader} from "./utils/walletconnect/loader"

config(getDefaultConfig())

initServiceRegistry({coreStrategies})

// Automatically load fcl-wc plugin
// Based on the user's config
initFclWcLoader()
