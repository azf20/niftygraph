import { BigInt, Address } from "@graphprotocol/graph-ts"
import {
  NiftyInk,
  newInk,
  SetPriceCall
} from "../generated/NiftyInk/NiftyInk"
import {
  NiftyToken,
  mintedInk,
  Transfer,
  SetTokenPriceCall,
  boughtInk
} from "../generated/NiftyToken/NiftyToken"
import { Ink, Artist, Token, TokenTransfer, Sale } from "../generated/schema"

  // Note: If a handler doesn't require existing field values, it is faster
  // _not_ to load the entity from the store. Instead, create it fresh with
  // `new Entity(...)`, set the fields that should be updated and save the
  // entity back to the store. Fields that were not set or unset remain
  // unchanged, allowing for partial updates to be applied.

  // It is also possible to access smart contracts from mappings. For
  // example, the contract that has emitted the event can be connected to
  // with:
  //
  // let contract = Contract.bind(event.address)
  //
  // The following functions can then be called on this contract to access
  // state variables and other data:
  //
  // - contract.artistTake(...)
  // - contract.checkSignature(...)
  // - contract.checkSignatureFlag(...)
  // - contract.createInk(...)
  // - contract.createInkFromSignature(...)
  // - contract.getSigner(...)
  // - contract.getTrustedForwarder(...)
  // - contract.inkIdByInkUrl(...)
  // - contract.inkInfoById(...)
  // - contract.inkInfoByInkUrl(...)
  // - contract.inkOfArtistByIndex(...)
  // - contract.inksCreatedBy(...)
  // - contract.isTrustedForwarder(...)
  // - contract.niftyRegistry(...)
  // - contract.owner(...)
  // - contract.setPrice(...)
  // - contract.setPriceFromSignature(...)
  // - contract.totalInks(...)
  // - contract.versionRecipient(...)

export function handlenewInk(event: newInk): void {

  let artist = Artist.load(event.params.artist.toHexString())

  if (artist == null) {
    artist = new Artist(event.params.artist.toHexString())
    artist.address = event.params.artist
    artist.inkCount = BigInt.fromI32(1)
  }
  else {
    artist.inkCount = artist.inkCount.plus(BigInt.fromI32(1))
  }

  let ink = Ink.load(event.params.inkUrl)

  if (ink == null) {
    ink = new Ink(event.params.inkUrl)
  }

  ink.inkId = event.params.id
  ink.artist = artist.id
  ink.limit = event.params.limit
  ink.jsonUrl = event.params.jsonUrl
  ink.createdAt = event.block.timestamp

  ink.save()
  artist.save()
}

export function handleSetPrice(call: SetPriceCall): void {
  // Entities can be loaded from the store using a string ID; this ID
  // needs to be unique across all entities of the same type
  let ink = Ink.load(call.inputs.inkUrl)

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand

  // Entity fields can be set based on event parameters
  ink.mintPrice = call.inputs.price

  ink.save()
}

export function handleMintedInk(event: mintedInk): void {

  let ink = Ink.load(event.params.inkUrl)

  if (ink == null) {
    ink = new Ink(event.params.inkUrl)
  }

  ink.count = ink.count.plus(BigInt.fromI32(1))

  let token = new Token(event.params.id.toString())

  token.ink = event.params.inkUrl
  token.owner = event.params.to
  token.createdAt = event.block.timestamp
  token.network = "xdai"

  ink.save()
  token.save()
}

export function handleTransfer(event: Transfer): void {

  let tokenId = event.params.tokenId.toString()

  let token = Token.load(tokenId)

  if (token !== null) {
    token.owner = event.params.to
    token.save()
  }

  let transfer = new TokenTransfer(event.transaction.hash.toHex())

  transfer.token = tokenId
  transfer.to = event.params.to
  transfer.from = event.params.from
  transfer.createdAt = event.block.timestamp

  transfer.save()
}

export function handleBoughtInk(event: boughtInk): void {

  let sale = new Sale(event.transaction.hash.toHex() + "-" + event.logIndex.toString())

  let tokenId = event.params.id.toString()

  let token = Token.load(tokenId)
  let ink = Ink.load(event.params.inkUrl)
  let artist = Artist.load(ink.artist)
  let transfer = TokenTransfer.load(event.transaction.hash.toHex())

  //let contract = NiftyInk.bind(Address.fromString("0x49dE55fbA08af88f55EB797a456fdf76B151c8b0"))
  //let artistTake = contract.artistTake()

  if (transfer !== null) {
    if (transfer.from == Address.fromString("0x0000000000000000000000000000000000000000") || transfer.from == artist.address) {
      sale.saleType = "primary"
      sale.artistTake = event.transaction.value
      sale.seller = artist.address
    } else {
      sale.saleType = "secondary"
      sale.artistTake = (((event.transaction.value).times(BigInt.fromI32(1))) / BigInt.fromI32(100))
      sale.seller = transfer.from
    }
  }

  if (token !== null) {
    token.price = BigInt.fromI32(0)
    token.save()
  }

  sale.token = tokenId
  sale.price = event.transaction.value
  sale.buyer = event.transaction.from
  sale.artist = ink.artist
  sale.ink = event.params.inkUrl
  sale.createdAt = event.block.timestamp
  sale.transfer = event.transaction.hash.toHex()

  sale.save()
}
