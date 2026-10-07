import { resendLoginOtp } from "@/lib/login-otp-routes";
export async function POST(req: Request) {
  return resendLoginOtp(req, true);
}
