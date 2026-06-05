import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const NOINDEX = "noindex, nofollow, noarchive, nosnippet";

export function proxy(request: NextRequest) {
  if (!isOpsMode()) return NextResponse.next();

  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    return withNoindex(NextResponse.redirect(new URL("/ops", request.url)));
  }

  if (isAllowedOpsPath(pathname)) {
    return withNoindex(NextResponse.next());
  }

  if (pathname.startsWith("/api/")) {
    return withNoindex(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
    );
  }

  return withNoindex(NextResponse.redirect(new URL("/ops", request.url)));
}

function isOpsMode() {
  return process.env.NEXT_PUBLIC_APP_MODE?.trim() === "ops" || process.env.APP_MODE?.trim() === "ops";
}

function isAllowedOpsPath(pathname: string) {
  return (
    pathname === "/ops" ||
    pathname.startsWith("/ops/") ||
    pathname.startsWith("/api/ops/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/hum-icon.svg" ||
    pathname.startsWith("/icons/")
  );
}

function withNoindex(response: NextResponse) {
  response.headers.set("X-Robots-Tag", NOINDEX);
  return response;
}

export const config = {
  matcher: "/:path*",
};
