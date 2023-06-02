import {sansPrefix, withPrefix} from "@onflow/util-address"
import {invariant} from "@onflow/util-invariant"
import {log} from "@onflow/util-logger"
import {isTransaction} from "../interaction/interaction.js"
import {createSignableVoucher} from "./voucher.js"

const MAX_DEPTH_LIMIT = 5

const CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789".split("")
const generateRandomChar = () => CHARACTERS[~~(Math.random() * CHARACTERS.length)]
const generateUuid = () => Array.from({length: 10}, generateRandomChar).join("")

const createAccountId = acct => `${withPrefix(acct.addr)}-${acct.keyId}`
const isFunction = value =>
  value &&
  (Object.prototype.toString.call(value) === "[object Function]" ||
    "function" === typeof value ||
    value instanceof Function)

const concatenateAccountIds = (...ids) => ids.join("-")

const ROLES = {
  PAYER: "payer",
  PROPOSER: "proposer",
  AUTHORIZATIONS: "authorizations",
}

// Flattens a nested array recursively up to a specified depth limit.
function recursivelyFlattenArray(element, depthLimit = 3) {
  if (depthLimit <= 0) return element
  if (!Array.isArray(element)) return element
  return recursivelyFlattenArray(
    element.flatMap(e => e),
    depthLimit - 1
  )
}

// Function to create a memoized version of a function
function memoizeAsync(fn) {
  const cache = new Map();
  return async function(arg) {
    if (cache.has(arg)) {
      return cache.get(arg);
    }
    const result = await fn(arg);
    cache.set(arg, result);
    return result;
  };
}

// Builds a pre-signable object from the given account and interaction.
export function buildPreSignable(account, interaction) {
  try {
    return {
      f_type: "PreSignable",
      f_vsn: "1.0.1",
      roles: account.role,
      cadence: interaction.message.cadence,
      args: interaction.message.arguments.map(d => interaction.arguments[d].asArgument),
      data: {},
      interaction: interaction,
      voucher: createSignableVoucher(interaction),
    }
  } catch (error) {
    console.error("buildPreSignable", error)
    throw error
  }
}

// Removes unused accounts from the interaction.
async function removeUnusedInteractionAccounts(interaction) {
  const payerTempIds = Array.isArray(interaction.payer) ? interaction.payer : [interaction.payer]
  const authorizersTempIds = Array.isArray(interaction.authorizations)
    ? interaction.authorizations
    : [interaction.authorizations]
  const proposerTempIds = Array.isArray(interaction.proposer)
    ? interaction.proposer
    : [interaction.proposer]

  const interactionAccountKeys = Object.keys(interaction.accounts)
  const uniqueTempIds = [
    ...new Set(payerTempIds.concat(authorizersTempIds, proposerTempIds)),
  ]

  for (const interactionAccountKey of interactionAccountKeys) {
    if (!uniqueTempIds.find(id => id === interactionAccountKey)) {
      delete interaction.accounts[interactionAccountKey]
    }
  }
}

// Adds an account to the interaction.
function addAccountToInteraction(interaction, newAccount) {
  if (
    typeof newAccount.addr === "string" &&
    (typeof newAccount.keyId === "number" ||
      typeof newAccount.keyId === "string")
  ) {
    newAccount.tempId = createAccountId(newAccount)
  } else {
    newAccount.tempId = generateUuid()
  }

  const existingAccount = interaction.accounts[newAccount.tempId] || newAccount
  interaction.accounts[newAccount.tempId] = existingAccount

  interaction.accounts[newAccount.tempId].role = {
    ...existingAccount.role,
    ...newAccount.role,
  }

  return interaction.accounts[newAccount.tempId]
}

// Returns an array of unique accounts by flattening and removing duplicates.
function getUniqueAccounts(accounts) {
  const flatAccounts = recursivelyFlattenArray(accounts)
  const seen = new Set()

  return flatAccounts
    .map(account => {
      const accountId = concatenateAccountIds(
        account.tempId,
        account.role.payer,
        account.role.proposer,
        account.role.authorizer,
        account.role.param
      )
      if (seen.has(accountId)) return null
      seen.add(accountId)
      return account
    })
    .filter(account => account !== null)
}

// Recursively resolves an account.
async function recursivelyResolveAccount(
  interaction,
  account,
  depthLimit = MAX_DEPTH_LIMIT
) {
  if (depthLimit <= 0) {
    throw new Error(
      `recursivelyResolveAccount Error: Depth limit (${MAX_DEPTH_LIMIT}) reached. Ensure your authorization functions resolve to an account after ${MAX_DEPTH_LIMIT} resolves.`
    )
  }
  if (!account) return null

  account = addAccountToInteraction(interaction, account)

  if (account?.resolve) {
    if (isFunction(account?.resolve)) {
      let resolvedAccounts = await account.resolve(
        account,
        buildPreSignable(account, interaction)
      )

      resolvedAccounts = Array.isArray(resolvedAccounts)
        ? resolvedAccounts
        : [resolvedAccounts]

      const flatResolvedAccounts = recursivelyFlattenArray(resolvedAccounts)

      account.resolve = flatResolvedAccounts

      account = addAccountToInteraction(interaction, account)

      const recursedAccounts = await Promise.all(
        flatResolvedAccounts.map(async resolvedAccount => {
          const addedResolvedAccount = addAccountToInteraction(interaction, resolvedAccount)
          return await memoizedRecursivelyResolveAccount(
            interaction,
            addedResolvedAccount,
            depthLimit - 1
          )
        })
      )

      return recursedAccounts ? recursedAccounts : account
    } else {
      if (Array.isArray(account.resolve)) {
        account.resolve = account.resolve.map(acct => addAccountToInteraction(interaction, acct))
      } else {
        account.resolve = addAccountToInteraction(interaction, account.resolve)
      }

      return account.resolve
    }
  }
  return account
}

// Wrap recursivelyResolveAccount with memoizeAsync
const memoizedRecursivelyResolveAccount = memoizeAsync(recursivelyResolveAccount);

// Resolves accounts of a particular type (payer, proposer, or authorizations) within the interaction.
async function resolveAccountType(interaction, type) {
  invariant(
    interaction && typeof interaction === "object",
    "recurseResolveAccount Error: interaction not defined"
  )
  invariant(
    type === ROLES.PAYER ||
      type === ROLES.PROPOSER ||
      type === ROLES.AUTHORIZATIONS,
    "recurseResolveAccount Error: type must be 'payer', 'proposer' or 'authorizations'"
  )

  let accountTempIDs = Array.isArray(interaction[type]) ? interaction[type] : [interaction[type]]

  let allResolvedAccounts = []
  for (let accountId of accountTempIDs) {
    let account = interaction.accounts[accountId]

    invariant(account, `recurseResolveAccount Error: account not found`)

    let resolvedAccounts = await memoizedRecursivelyResolveAccount(interaction, account)

    if (resolvedAccounts) {
      allResolvedAccounts = allResolvedAccounts.concat(resolvedAccounts)
    } else {
      allResolvedAccounts = allResolvedAccounts.concat(account)
    }
  }

  return getUniqueAccounts(allResolvedAccounts)
}

// Recurses through the interaction accounts and resolves them.
export async function recurseResolveAccounts(interaction) {
  invariant(
    isTransaction(interaction),
    "recurseResolveAccounts Error: Must be transaction interaction"
  )

  interaction.payer = await resolveAccountType(interaction, ROLES.PAYER)
  interaction.authorizations = await resolveAccountType(interaction, ROLES.AUTHORIZATIONS)
  interaction.proposer = await resolveAccountType(interaction, ROLES.PROPOSER)

  await removeUnusedInteractionAccounts(interaction)

  return interaction
}
