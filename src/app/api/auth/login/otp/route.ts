import { verifyLoginOtp } from "@/lib/login-otp-routes";
export async function POST(req: Request) {
  return verifyLoginOtp(req, false);
}
