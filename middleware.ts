import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  getBasicAuthChallengeHeaders,
  isAuthorizedRequest,
} from "@/lib/server/basic-auth"

export function middleware(request: NextRequest) {
  // isAuthorizedRequest already handles dev bypass when auth is not configured
  if (isAuthorizedRequest(request.headers.get("authorization"))) {
    return NextResponse.next()
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: getBasicAuthChallengeHeaders(),
  })
}

export const config = {
  matcher: [
    "/employees/:path*",
    "/insights/:path*",
    "/responses/:path*",
    "/api/admin/:path*",
    "/api/feedback-response/:path*",
    "/api/notify-chat/:path*",
    "/mutombo/:path*",
  ],
}
