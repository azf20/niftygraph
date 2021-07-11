import { BigInt, Address, ipfs, json, JSONValueKind, log, TypedMap } from "@graphprotocol/graph-ts"
import {
  NiftyInk,
  newInk,
  SetPriceCall,
  SetPriceFromSignatureCall
} from "../generated/NiftyInk/NiftyInk"
import {
  NiftyToken,
  mintedInk,
  Transfer,
  SetTokenPriceCall,
  boughtInk
} from "../generated/NiftyToken/NiftyToken"
import {
  NiftyMediator,
  newPrice,
  tokenSentViaBridge
} from "../generated/NiftyMediator/NiftyMediator"
import {
  liked
} from "../generated/Liker/Liker";
import { Ink, Artist, Token, TokenTransfer, Sale, RelayPrice, Total, MetaData, InkLookup, Like } from "../generated/schema"


 function updateMetaData(metric: String, value: String): void {
   let metaData = new MetaData(metric)
   metaData.value = value
   metaData.save()
 }

 function incrementTotal(metric: String, timestamp: BigInt): void {

    let stats = Total.load("latest")
    let day = (timestamp / BigInt.fromI32(86400)) * BigInt.fromI32(86400)

    if (stats == null) {
      stats = new Total("latest")
    } else {
      if (stats.day !== day) {
        let yesterdayStats = stats
        yesterdayStats.id = stats.day.toString()
        yesterdayStats.save()
        stats.id = "latest"
      }
    }

    stats.day = day

    if(metric == 'inks') {
      stats.inks = stats.inks + BigInt.fromI32(1)
    }
    else if (metric == 'tokens') {
      stats.tokens = stats.tokens + BigInt.fromI32(1)
    }
    else if (metric == 'upgrades') {
      stats.upgrades = stats.upgrades + BigInt.fromI32(1)
    }
    else if (metric == 'sales') {
      stats.sales = stats.sales + BigInt.fromI32(1)
    }
    else if (metric == 'artists') {
      stats.artists = stats.artists + BigInt.fromI32(1)
    }

    stats.save()
  }

function checkBestPrice(ink: Ink | null): Ink | null {

  if(ink !== null) {
    if(ink.mintPrice.isZero()) {
      ink.bestPrice = BigInt.fromI32(0)
      ink.bestPriceSource = null
      ink.bestPriceSetAt = null
    } else {
      ink.bestPrice = ink.mintPrice
      ink.bestPriceSource = 'ink'
      ink.bestPriceSetAt = ink.mintPriceSetAt
    }

    for (let i = 0, len=ink.tokens.length; i < len; i++) {
        let tokens = ink.tokens
        let id = tokens[i]
        let token = Token.load(id)

        if(token.price > BigInt.fromI32(0)) {
          if(ink.bestPrice.isZero()) {
            ink.bestPrice = token.price
            ink.bestPriceSource = id
            ink.bestPriceSetAt = token.priceSetAt
          } else if (token.price < ink.bestPrice) {
            ink.bestPrice = token.price as BigInt
            ink.bestPriceSource = id
            ink.bestPriceSetAt = token.priceSetAt
          }
      }
    }
  }

  return ink
}

export function handlenewInk(event: newInk): void {

  let artist = Artist.load(event.params.artist.toHexString())

  if (artist == null) {
    artist = new Artist(event.params.artist.toHexString())
    artist.address = event.params.artist
    artist.inkCount = BigInt.fromI32(1)
    artist.earnings = BigInt.fromI32(0)
    artist.likeCount = BigInt.fromI32(0)
    artist.saleCount = BigInt.fromI32(0)
    artist.lastLikeAt = BigInt.fromI32(0)
    artist.lastSaleAt = BigInt.fromI32(0)
    artist.createdAt = event.block.timestamp
    artist.lastInkAt = event.block.timestamp
    incrementTotal('artists',event.block.timestamp)
  }
  else {
    artist.inkCount = artist.inkCount.plus(BigInt.fromI32(1))
    artist.lastInkAt = event.block.timestamp
  }

  let ink = Ink.load(event.params.inkUrl)

  if (ink == null) {
    ink = new Ink(event.params.inkUrl)
  }

//  let jsonBytes = ipfs.cat(event.params.jsonUrl)
//  if (jsonBytes !== null) {
//    let data = json.fromBytes(jsonBytes!);
//    if (data !== null) {
//      if (data.kind !== JSONValueKind.OBJECT) {
//        log.debug('[mapping] [loadIpfs] JSON data from IPFS is not an OBJECT', [
//        ]);
//    } else {
//        let obj = data.toObject();
//        ink.name = obj.get("name").toString();
//        ink.image = obj.get("image").toString();
//        ink.description = obj.get("description").toString();
//      }
//  }
//  }

  ink.inkNumber = event.params.id
  ink.artist = artist.id
  ink.limit = event.params.limit
  ink.jsonUrl = event.params.jsonUrl
  ink.createdAt = event.block.timestamp
  ink.tokens = []
  ink.mintPrice = BigInt.fromI32(0)
  ink.bestPrice = BigInt.fromI32(0)
  ink.likeCount = BigInt.fromI32(0)
  ink.burnedCount = BigInt.fromI32(0)
  ink.burned = false

  ink.save()
  artist.save()

  let inkLookup = new InkLookup(ink.inkNumber.toString())
  inkLookup.inkId = ink.id
  inkLookup.save()

  incrementTotal('inks',event.block.timestamp)
  updateMetaData('blockNumber',event.block.number.toString())
}

function _handleSetPrice(inkUrl: String, price: BigInt, timestamp: BigInt): void {

  let ink = Ink.load(inkUrl)

  ink.mintPriceNonce = ink.mintPriceNonce + BigInt.fromI32(1)
  ink.mintPrice = price
  ink.mintPriceSetAt = timestamp

  if(price > BigInt.fromI32(0)) {

    if(ink.bestPrice.isZero()) {
      ink.bestPrice = price
      ink.bestPriceSource = 'ink'
      ink.bestPriceSetAt = timestamp
    } else if (price <= ink.bestPrice) {
      ink.bestPrice = price
      ink.bestPriceSource = 'ink'
      ink.bestPriceSetAt = timestamp
    }
  } else {
    ink = checkBestPrice(ink)
  }

  ink.save()
}

export function handleSetPriceFromSignature(call: SetPriceFromSignatureCall): void {
  _handleSetPrice(call.inputs.inkUrl, call.inputs.price, call.block.timestamp)
  updateMetaData('blockNumber',call.block.number.toString())
}

export function handleSetPrice(call: SetPriceCall): void {
  _handleSetPrice(call.inputs.inkUrl, call.inputs.price, call.block.timestamp)
  updateMetaData('blockNumber',call.block.number.toString())
}

export function handleSetTokenPrice(call: SetTokenPriceCall): void {

  let token = Token.load(call.inputs._tokenId.toString())
  let ink = Ink.load(token.ink)
  token.price = call.inputs._price
  token.priceSetAt = call.block.timestamp
  token.save()

  if(token.price > BigInt.fromI32(0)) {
    if(ink.bestPrice.isZero()) {
      ink.bestPrice = token.price
      ink.bestPriceSource = token.id
      ink.bestPriceSetAt = token.priceSetAt
    } else if (token.price < ink.bestPrice) {
      ink.bestPrice = token.price
      ink.bestPriceSource = token.id
      ink.bestPriceSetAt = token.priceSetAt
    }
  } else if(ink.bestPrice > BigInt.fromI32(0)) {
      ink = checkBestPrice(ink)
  }

  ink.save()
  updateMetaData('blockNumber',call.block.number.toString())

}

export function handleMintedInk(event: mintedInk): void {

  let ink = Ink.load(event.params.inkUrl)

  ink.count = ink.count.plus(BigInt.fromI32(1))

  if (ink.count == ink.limit && ink.limit != BigInt.fromI32(1)) {

    ink.mintPrice = BigInt.fromI32(0)
    ink.mintPriceSetAt = event.block.timestamp

    if(ink.bestPrice > BigInt.fromI32(0)) {
      ink = checkBestPrice(ink)
    }
  }

  let tokenArray = ink.tokens
  tokenArray.push(event.params.id.toString())
  ink.tokens = tokenArray

  let token = new Token(event.params.id.toString())

  token.ink = event.params.inkUrl
  token.owner = event.params.to
  token.createdAt = event.block.timestamp
  token.network = "xdai"
  token.price = BigInt.fromI32(0)
  token.burned = false
  token.transferCount = BigInt.fromI32(0)
  token.artist = ink.artist
  token.edition = ink.count

  let tokenTransfer = new TokenTransfer(token.id + "-" + token.transferCount.toString())

  if (tokenTransfer !== null) {
    tokenTransfer.ink = token.ink
    tokenTransfer.artist = ink.artist
    tokenTransfer.save()
  }

  ink.save()
  token.save()

  incrementTotal('tokens',event.block.timestamp)
  updateMetaData('blockNumber',event.block.number.toString())
}

export function handleTransfer(event: Transfer): void {

  let tokenId = event.params.tokenId.toString()

  let token = Token.load(tokenId)
  let transferCount = BigInt.fromI32(0)
  let inkId = ''
  let artistId = ''

  if (token !== null) {
    token.owner = event.params.to
    token.transferCount = token.transferCount + BigInt.fromI32(1)

    let ink = Ink.load(token.ink)

    inkId = token.ink
    artistId = ink.artist

    if(event.params.to == Address.fromString("0x0000000000000000000000000000000000000000") || event.params.to == Address.fromString("0x000000000000000000000000000000000000dEaD")) {
      token.burned = true
      ink.burnedCount = ink.burnedCount + BigInt.fromI32(1)
      if(ink.burnedCount == ink.limit) {
        ink.burned = true
      }
    }

    if(token.price > BigInt.fromI32(0)) {
      token.price = BigInt.fromI32(0)
      token.priceSetAt = event.block.timestamp
      token.save()
      ink = checkBestPrice(ink)
      }
    else {
      token.save()
    }

    ink.save()
    }

  let transfer = new TokenTransfer(tokenId + "-" + token.transferCount.toString())

  transfer.token = tokenId
  transfer.to = event.params.to
  transfer.from = event.params.from
  transfer.createdAt = event.block.timestamp
  transfer.transactionHash = event.transaction.hash.toHex()
  transfer.ink = inkId
  transfer.artist = artistId

  if(event.address == Address.fromString("0xCF964c89f509a8c0Ac36391c5460dF94B91daba5")) {
    transfer.network = 'xdai'
  }
  if(event.address == Address.fromString("0xc02697c417DdAcfbe5EdbF23eDad956BC883F4fb")) {
    transfer.network = 'mainnet'
  }

  transfer.save()
  updateMetaData('blockNumber',event.block.number.toString())
}

export function handleBoughtInk(event: boughtInk): void {

  let sale = new Sale(event.transaction.hash.toHex() + "-" + event.logIndex.toString())

  let tokenId = event.params.id.toString()

  let token = Token.load(tokenId)
  let ink = Ink.load(event.params.inkUrl)
  let artist = Artist.load(ink.artist)
  let transfer = TokenTransfer.load(tokenId + "-" + token.transferCount.toString())

  //let contract = NiftyInk.bind(Address.fromString("0x49dE55fbA08af88f55EB797a456fdf76B151c8b0"))
  //let artistTake = contract.artistTake()

  if (transfer !== null) {
    if (transfer.from == Address.fromString("0x0000000000000000000000000000000000000000") || transfer.from == artist.address) {
      sale.saleType = "primary"
      sale.artistTake = event.params.price
      sale.seller = artist.address
      artist.earnings = artist.earnings + event.params.price
    } else {
      sale.saleType = "secondary"
      sale.artistTake = (((event.params.price).times(BigInt.fromI32(1))) / BigInt.fromI32(100))
      sale.seller = transfer.from
      artist.earnings = artist.earnings + sale.artistTake
    }
    transfer.sale = event.transaction.hash.toHex() + "-" + event.logIndex.toString()
    transfer.save()
  }

  artist.saleCount = artist.saleCount.plus(BigInt.fromI32(1))
  artist.lastSaleAt = event.block.timestamp

  sale.token = tokenId
  sale.price = event.params.price
  sale.buyer = event.params.buyer
  sale.artist = ink.artist
  sale.ink = event.params.inkUrl
  sale.createdAt = event.block.timestamp
  sale.transfer = tokenId + "-" + token.transferCount.toString()
  sale.transactionHash = event.transaction.hash.toHex()

  sale.save()
  artist.save()

  incrementTotal('sales',event.block.timestamp)
  updateMetaData('blockNumber',event.block.number.toString())
}

export function handleMintedOnMain (event: mintedInk): void {

  let token = Token.load(event.params.id.toString())

  token.network = "mainnet"
  token.upgradeTransfer = token.id + "-" + token.transferCount.toString()

  token.save()
  updateMetaData('blockNumber',event.block.number.toString())
}

export function handleTokenSentViaBridge (event: tokenSentViaBridge): void {

  let token = Token.load(event.params._tokenId.toString())

  token.network = "mainnet"
  token.upgradeTransfer = event.transaction.hash.toHex()

  token.save()

  incrementTotal('upgrades',event.block.timestamp)
  updateMetaData('blockNumber',event.block.number.toString())
}

export function handleNewRelayPrice (event: newPrice): void {

  let currentPrice = RelayPrice.load("current")

  if (currentPrice !== null) {
    currentPrice.id = currentPrice.createdAt.toString()
    currentPrice.save()
  }

  let updatedPrice = new RelayPrice("current")
  updatedPrice.price = event.params.price
  updatedPrice.createdAt = event.block.timestamp
  updatedPrice.save()
  updateMetaData('blockNumber',event.block.number.toString())
}

export function handleLikedInk (event: liked): void {

  let inkLookup = InkLookup.load(event.params.target.toString())
  let ink = Ink.load(inkLookup.inkId)
  ink.likeCount = ink.likeCount + BigInt.fromI32(1)
  ink.save()

  let newLike = new Like(event.transaction.hash.toHex() + "-" + event.logIndex.toString())
  newLike.liker = event.params.liker
  newLike.ink = inkLookup.inkId
  newLike.createdAt = event.block.timestamp
  newLike.artist = ink.artist
  newLike.save()

  let artist = Artist.load(ink.artist)
  artist.likeCount = artist.likeCount.plus(BigInt.fromI32(1))
  artist.lastLikeAt = event.block.timestamp
  artist.save()

}
