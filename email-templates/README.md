# Supabase auth setup — Lark

One-time configuration in the Supabase dashboard to make password reset work and to use the branded emails. Project: `ihizwxytvlfsvakzrqck`.

## 1. Fix the "error on confirmation link" issue

This is why the current sign-up link looks broken even though it works. Supabase needs to know which URLs are allowed to receive the token.

1. Open Supabase → **Authentication** → **URL Configuration**.
2. **Site URL**: set to `https://wandermind-wine.vercel.app`
3. **Redirect URLs**: add both of these, one per line:
   - `https://wandermind-wine.vercel.app/**`
   - `http://localhost:5173/**` (so local dev still works)
4. Click **Save**.

Without this, Supabase strips the redirect and shows its own error page even though the session got created in the background — exactly the symptom you described.

## 2. Paste the branded email templates

1. Supabase → **Authentication** → **Emails**.
2. **Confirm signup**
   - Subject: `Welcome to Lark — confirm your email`
   - Message body (HTML): paste the full contents of `confirm-signup.html`
   - Save
3. **Reset password**
   - Subject: `Reset your Lark password`
   - Message body (HTML): paste the full contents of `reset-password.html`
   - Save

The templates use Supabase's `{{ .ConfirmationURL }}` variable — don't change those tags. Everything else can be edited freely.

## 3. Test the flows

**Sign-up confirmation**
1. Open the live app, sign up with a real email you can check.
2. Open the email — it should look Lark-branded.
3. Click "Confirm my email". The browser should land on the Lark site URL with no error page, then you can sign in.

**Password reset**
1. On the sign-in screen, click **Forgot?** next to the password field.
2. Enter your email, send the link.
3. Open the email, click "Choose a new password".
4. App opens straight to the "Set a new password" screen, type a new password, submit.
5. You should land in the app, signed in with the new password.

## 4. Sender address (free tier note)

Emails will come from `noreply@mail.app.supabase.io` for now. To send from `hello@thread-revolution.com` or similar, set up custom SMTP under **Project settings → Auth → SMTP Settings** later. Resend, Postmark and Brevo all have free tiers that work.
