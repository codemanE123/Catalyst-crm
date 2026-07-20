# Partners and team invites

## Partners (corporate / industry)

Contacts may belong to either a **school** or a **partner organization** (not both).

Partner fields: name, type (`Corporate` | `Industry partner` | `Other`), website, industry, notes.

Contact extras: LinkedIn URL; optional **linked schools** for partner contacts.

Create partners and contacts on `/contacts`. Same directory lists both with a type filter.

Migration: `20260720150000_partners_and_membership_invites.sql`.

## Team invite links

Admins create links from **Settings → Members**.

- Default role: `sales` (also `read_only` / `admin`)
- Expires in 7 days, max 25 uses, revocable
- Recipient opens `/invite/<token>`, creates email/password account, joins the org
- Requires `SUPABASE_SERVICE_ROLE_KEY` on the deployment that serves the invite page
- Set `NEXT_PUBLIC_APP_URL` to your Production URL so copied links are correct

Mixed email domains are allowed. No public CRM without login.
