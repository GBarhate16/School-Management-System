import GoogleIcon from "@/components/icons/Google";
import Link from "next/link";

type Props = {
  redirectUrl?: string;
};

export default function GoogleOAuthBtn({ redirectUrl }: Props) {
  const state = redirectUrl ? `&state=${redirectUrl}` : "";

  const redirectUri =
    process.env.NODE_ENV === "production"
      ? "https://school-management-system-henna.vercel.app/auth/session/callback"
      : "http://localhost:3000/auth/session/callback";

  const URL = `https://accounts.google.com/o/oauth2/auth?redirect_uri=${redirectUri}&response_type=token&client_id=${process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}&scope=openid%20email%20profile${state}`;

  return (
    <button className="hover:bg-muted flex w-full cursor-pointer items-center justify-center rounded-md border p-1 font-semibold duration-100">
      <Link href={URL} className="flex items-center justify-center">
        <GoogleIcon className="size-8" />
        <span>Google</span>
      </Link>
    </button>
  );
}
