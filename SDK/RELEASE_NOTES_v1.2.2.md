# Python SDK v1.2.2

This patch release strengthens login cleanup, session replacement, heartbeat configuration, and resilience during temporary service outages.

## Highlights

- Releases a newly bound device on a best-effort basis when local signature or clock validation rejects a server-approved login.
- Safely closes the previous session before validating a replacement license. If the previous logout fails, replacement validation is stopped and the client remains logged out.
- Validates heartbeat intervals and offline-grace settings. Heartbeat intervals support 60–1,200 seconds; offline grace defaults to 0 and supports up to 3,600 seconds.
- Allows an existing session to tolerate configured transient network/service outages while continuing to fail closed on server denials, invalid signatures/nonces, malformed responses, and TLS verification errors.
- Documents server-enforced device leases and app-specific heartbeat/offline-grace settings. These lease controls require the corresponding updated License Server; the SDK does not extend or enforce the server lease locally.

## Compatibility

No existing public SDK exports were removed. Offline grace is disabled by default, preserving fail-closed behavior unless an administrator explicitly configures it. This release note describes the local v1.2.2 candidate; hosted release, staging, and production verification are not yet confirmed.

---

# Python SDK v1.2.2 (বাংলা)

এই patch release-এ login cleanup, session replacement, heartbeat configuration এবং সাময়িক service outage সামলানোর নির্ভরযোগ্যতা উন্নত করা হয়েছে।

## উল্লেখযোগ্য পরিবর্তন

- Server login অনুমোদন করার পর local signature বা clock validation ব্যর্থ হলে best-effort logout দিয়ে নতুন device binding ছাড়ার চেষ্টা করে।
- নতুন license যাচাইয়ের আগে আগের session নিরাপদে বন্ধ করে। আগের logout ব্যর্থ হলে নতুন license যাচাই হয় না এবং client logged out থাকে।
- Heartbeat interval ও offline-grace setting validate করে। Heartbeat interval ৬০–১,২০০ সেকেন্ড; offline grace-এর default `0`, সর্বোচ্চ ৩,৬০০ সেকেন্ড।
- আগে থেকে চলমান session-এ administrator-configured সাময়িক network/service outage grace সমর্থন করে; server denial, invalid signature/nonce, malformed response এবং TLS verification failure-এ fail-closed থাকে।
- Server-enforced device lease এবং app-specific heartbeat/offline-grace setting-এর documentation যোগ করা হয়েছে। Lease কার্যকর করতে সংশ্লিষ্ট updated License Server প্রয়োজন; SDK স্থানীয়ভাবে server lease বাড়ায় বা enforce করে না।

## সামঞ্জস্য ও যাচাইকরণ

বিদ্যমান public SDK export সরানো হয়নি। Offline grace default-এ বন্ধ, তাই administrator চালু না করলে fail-closed আচরণ অপরিবর্তিত থাকে। এটি স্থানীয় v1.2.2 candidate-এর release note; hosted release, staging বা production verification এখনো নিশ্চিত নয়।
