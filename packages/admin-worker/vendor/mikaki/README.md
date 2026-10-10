# Mikaki RP adapter

`oidc.ts` is an unchanged copy of `crates/helpdesk-rp/oidc.ts` from Mikaki.
`source.json` pins the upstream commit and SHA-256; the upstream MIT license is
included. This keeps the prototype independent of a sibling checkout at runtime
while reusing Mikaki's login, managed session check and back-channel logout code.

To review an upstream update, run from the sorane root:

```sh
node packages/admin-worker/scripts/sync-mikaki.ts ../mikaki
```

The script refuses an uncommitted adapter. Review the diff and run `npm run
admin:test` and `npm run admin:check`. A published shared Mikaki RP package can
replace this copy later. The cookie names retain Mikaki's `__Host-help-*` prefix
because the protocol adapter is unchanged; use a dedicated admin origin.
