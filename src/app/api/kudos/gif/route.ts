import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { consumeRateLimit, getRequestIp } from "@/lib/server/rate-limit"

const CURATED_GIF_IDS = [
  // celebration
  "NqiE7mIiXNAhYVUaZD", "l0MYt5jPR6QX5pnqM", "ddHhhUBn25cuQ",
  "hv14mGOF3MY7wDKPkE", "vmon3eAOp1WfK", "d5YttuybhUQt1BeGPh",
  "MG4ctSFB04ltvXpudW", "8NvXvlWeH71oa2Smxa", "artj92V8o75VPL7AeQ",
  "akiHW8qDydkm4", "q9SvlhH3D6sQOKRxx7", "GxIdtANXpn3qL1FG25",
  "rrmf3fICPZWg1MMXOW", "IAbrtESCyrqLOMlWdx", "doPrWYzSG1Vao",
  // congratulations
  "jJQC2puVZpTMO4vUs0", "ihef2mzZVbV4FygisP", "ely3apij36BJhoZ234",
  "mzZbByY3c3eoqy9CaP", "F7JHDDqWaSPaglz24x", "3oz9ZE2Oo9zRC",
  "NUjBZFKKJ3bqojMd5q", "AbM71atR2TJQq8c7vw", "OotF5vayuyWEm7iQ4A",
  "yLD5PKYq7tsQZPZXpn", "h0ExKQtARatt9p0ISF", "3o6fJ1BM7R2EBRDnxK",
  "QaXcpBEQRfD9pR3zk5", "NRynRIAMsxK0ao3qVg",
  // well done
  "YRuFixSNWFVcXaxpmX", "lFHtqqh6orvAhbiGmy", "xUA7b2iWIZd3e2jyec",
  "d31w24psGYeekCZy", "9uoYC7cjcU6w8", "hTOQHQ9lim011gF80j",
  "utAO8tteQGG2zGh9ic", "0MHgWp8xxjdd0TW0n6", "mGK1g88HZRa2FlKGbz",
  "MjCn41vDEGiqTtEOCz", "Hc8PMCBjo9BXa", "62FgLfGsONTTpwpxTl",
  "l41YmQjOz9qg2Ecow", "5XcvfzRIcJW9C4N6cR", "YvhQMhj1Ovli66CFtD",
  // good job
  "8ZblO3ZD5NMltPaFS2", "5hgYDDh5oqbmE4OKJ3", "VhWVAa7rUtT3xKX6Cd",
  "wijMRo7UZXSqA", "3o7abKhOpu0NwenH3O", "a0n4MOhzZab5cz3hWi",
  "8yZuEb7q6dlyP3L3cL", "kBZBlLVlfECvOQAVno", "8OJFaKKr8wKJqIFtvS",
  // high five
  "ag3PWAeHrCdWV0tlkD", "5wWf7GW1AzV6pF3MaVW", "hmVVRM1uV7vYA",
  "s4VoCsFz8prlhSFCeS", "l0ErFafpUCQTQFMSk", "100QWMdxQJzQC4",
  "QN6NnhbgfOpoI", "3oEjHV0z8S7WM4MwnK", "b5L1Lt3k4hGNDZWVIw",
  "lfXTXXjNCFbQ4", "OcZp0maz6ALok", "WYyvz9PIhjLHgiyvR2",
  "lgAjFQjqJX7vCNYcnw", "r2BtghAUTmpP2", "GYU7rBEQtBGfe",
  // applause
  "DvWJHSOxTff84SQsD9", "doUu2ByZDbPYQ", "xThtar0e9kO3WkwQ1O",
  "qnOBmH70CGSVa", "MOWPkhRAUbR7i", "l4q8cJzGdR9J8w3hS",
  "l3q2XhfQ8oCkm1Ts4", "jShr8wkP38XTO", "gpXfKa9xLAR56",
  "xT77XWum9yH7zNkFW0", "fnK0jeA8vIh2QLq3IZ", "l9Tllo1thElT5gvVOU",
  "QTAVEex4ANH1pcdg16",
  // bravo
  "ytTYwIlbD1FBu", "ZdUnQS4AXEl1AERdil", "HCPKqm4Awquxug6yhp",
  "iJgoGwkqb1mmH1mES3", "1dagNhv8Oqu6l8U3ZK", "Swx36wwSsU49HAnIhC",
  "7yOwB85TiTDhHBtu0m", "VD4UWaj4Vu5uAR9IoE", "Ru1Ja8DoCO60eDEZm9",
  "JiUatNrAt4dhNJSJAW", "RigR7bIE68H8VNsa2k", "10PptCqDkZIkZW",
  "9Hx2Jhutoccy75DzIm",
  // thumbs up
  "NdS5JYPZz6yPkXrpD5", "QEYYlJqOaEhXrjTrOH", "kQdtQ8JIYFRuoywakC",
  "OWFc25eLBw8Tu", "Ljtx4Lvkkh2iMgHQ6D", "5w0969WMSyrV0y2wGr",
  "Vkx70rvUyb5QuUSCy5", "VfGpVJAUix8SBHaVbK", "HqPBvbWEfj1Kdx38pZ",
  "dXVy3DIi95HDx5jNLV", "U95GuIdgjqBeHk3wqJ", "FBzeCJhUUVh3TedptK",
  "xTQZRUtiUSNyzmjq6d", "SUoc8Htg5H3IRmICyh", "q3FQGgHGMCU9veeGC4",
  // excited
  "ye080RbECtcCnkrSyD", "xTtpAMONxAyNvt0j7o", "14fe94oGGsupaw",
  "I48PlTLyNTnnkdqr33", "90F8aUepslB84", "bznNJlqAi4pBC",
  "31lPv5L3aIvTi", "nnFwGHgE4Mk5W", "TcKmUDTdICRwY",
  "aQYR1p8saOQla", "zetsDd1oSNd96", "H85LpFTwMZPoc",
  "vIpCeF7YcCrygqAn3R", "05tdd7n99oq9gprJqV",
  // party
  "blSTtZehjAZ8I", "MJL5ae814FDTW", "V6Ie2SGGIbIhFQdxJv",
  "EJMyMO22UxP68", "KXgJsSeOfvSgg", "5xaOcLGvzHxDKjufnLW",
  "j1mMc3lpVX67AVIpDe", "NDJWGU4n74di0", "qa0xvSMNC3Ltm",
  "61374X6M1XFHJmWYJG", "UmnWEKDFoPmcZHmwFl", "atQF1zaSGq8s8",
  "K4o1c3zfNQH59jWqSv", "lp8Kl4PZ8kY8pRr6Q2", "xgiki9IXibq2goEPdz",
  // cheering
  "11sBLVxNs7v6WA", "yBwgX64KAPrHW2ltZ2", "zdjQpEtni7XIV4ncNg",
  "faTOHi0omqCMU", "xkr831YtYrdsY", "CmbOLk68Y8WJ78hiSd",
  "n864qLqamxwZvS0kDf", "zN35M0MXo0N6j99m5Q", "o75ajIFH0QnQC3nCeD",
  "ufER859OhfRMOMlb14", "yoJC2K6rCzwNY2EngA", "t3sZxY5zS5B0z5zMIz",
  "l3V0wkQ2KKcAeW8Cs", "T0pqYd3qK2XHQTXirw",
  // amazing work
  "fNJWzR3aVZzc3tg5Le", "i17zHLTMt1SmJMv6Aw", "PuTQh4zbUDAeMRPUET",
  "ImI6k24xZFQsDWyLFV", "Ke5mKVauIXEMtGxmik", "7x5YuClvsBikBI0URG",
  "qYGvebgOKGygdQgflY", "3Ur6pxVvpL0qq1OWbK", "2xRu4Clh3DJhm",
  "h3uCITmuLW8Cbaf67I",
  // you did it
  "cBTTTOflV6A7FBJHs6", "3otPoS81loriI9sO8o", "l522kgooW2Qo9xtK5Z",
  "J5Xr9k7qK5KGRi45vp", "lNIL27DheDxYeg3ux3", "FOqMttBrfvb6tahk14",
  "thpiRxRPYsv30uUCva", "GqJ1SPkCGI30CDdyho", "cOvgh3VjLmeg8LLBtk",
  "UsTNoiGR7OBsDcUvuG", "8oyXqFkH0ETvbENweS",
  // way to go
  "D0mMjNfnx1uccMX23s", "wPQF6GfQzBi1561ip7", "BRdmWv9MEPLvQhljCE",
  "MKWIBZNPhRDJleZttg", "UtJtnnbCtJjSd0utDn", "80NOF1i2xJbnxUmtAB",
  "fCYV3hqN8j51P7U7AS", "0SxcWgFsxTpQEUkCwh",
  // standing ovation
  "PypcG4qBuMqDOny5vp", "tODygE8KCqBzy", "qIXVd1RoKGqlO",
  "cdXpgeB32BekIGzBNh", "xT9IggNqiMBqSAjrYA", "xBoKtVbZ1mTBi81MEF",
  "buNIHYa1z0QtzCC8FB", "g4zKfr4JjgGh6UAeFj", "6uOKby3tWy4yXwTa5H",
  "KXroJRl27T3ekb0mDl", "xT8qB5sar8diPvb7YA", "O8EJV0D4g6Ti0rhrnb",
  "WicZdyR749PJ0V7eUu",
]

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const ip = getRequestIp(request)
  const rl = consumeRateLimit({ bucket: "kudos-gif", key: ip, limit: 30, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  const pickId = CURATED_GIF_IDS[Math.floor(Math.random() * CURATED_GIF_IDS.length)]
  const url = `https://media.giphy.com/media/${pickId}/giphy.gif`

  return NextResponse.json({ url, id: pickId })
}
