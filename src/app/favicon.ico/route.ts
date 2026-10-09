/** Same site identity for traditional favicon requests, on either host. */
export function GET(request: Request) {
  return Response.redirect(new URL("/icon.png", request.url), 308);
}
