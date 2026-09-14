import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agentTokenPrefix,
  generateAgentToken,
  generatePassword,
  hashAgentToken,
  hashPassword,
  looksLikeAgentToken,
  looksLikeEmail,
  normalizeEmail,
  parseSessionToken,
  safeEqual,
  sessionExpired,
  sessionMac,
  sessionToken,
  verifyPassword,
} from "../shared/crypto.js";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "../shared/password.js";

const PASSWORD = "correct horse battery";

describe("password hashing", () => {
  const hash = hashPassword(PASSWORD);

  it("records the parameters alongside the hash", () => {
    assert.match(hash, /^scrypt\$\d+\$\d+\$\d+\$[\w-]+\$[\w-]+$/);
  });

  it("verifies the right password and rejects a wrong one", () => {
    assert.ok(verifyPassword(PASSWORD, hash));
    assert.ok(!verifyPassword(PASSWORD + "x", hash));
    assert.ok(!verifyPassword("", hash));
  });

  it("salts, so the same password hashes differently every time", () => {
    assert.notEqual(hashPassword(PASSWORD), hashPassword(PASSWORD));
  });

  it("does not throw on a stored value it cannot parse", () => {
    for (const stored of ["", "not-a-hash", "scrypt$1$2$3", "scrypt$x$y$z$a$b", "bcrypt$1$1$1$a$b"]) {
      assert.equal(verifyPassword(PASSWORD, stored), false, stored);
    }
  });

  it("normalizes to NFKC, so the same password from another keyboard matches", () => {
    const composed = "café latte one"; // é as one code point
    const decomposed = "café latte one"; // e + combining acute
    assert.ok(verifyPassword(decomposed, hashPassword(composed)));
  });
});

describe("password rules", () => {
  it("rejects short, blank and over-long passwords", () => {
    assert.ok(passwordProblem("x".repeat(MIN_PASSWORD_LENGTH - 1)));
    assert.ok(passwordProblem("   "));
    assert.ok(passwordProblem("x".repeat(201)));
  });

  it("accepts a reasonable one", () => {
    assert.equal(passwordProblem("a-decent-password"), null);
  });

  it("generates passwords that satisfy its own rules", () => {
    for (let i = 0; i < 20; i++) {
      const generated = generatePassword();
      assert.match(generated, /^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
      assert.equal(passwordProblem(generated), null);
    }
  });
});

describe("session tokens", () => {
  const userId = "6f1e8b02-1111-4222-8333-444455556666";
  const hash = hashPassword(PASSWORD);
  const secret = "server-secret";

  const verify = (token: string, withHash = hash, withSecret = secret) => {
    const parsed = parseSessionToken(token);
    if (!parsed) return false;
    return safeEqual(parsed.mac, sessionMac(parsed.userId, parsed.issuedAt, withHash, withSecret));
  };

  it("round-trips and carries the user id", () => {
    const token = sessionToken(userId, hash, secret);
    assert.equal(parseSessionToken(token)?.userId, userId);
    assert.ok(verify(token));
  });

  it("fails under a different server secret", () => {
    assert.ok(!verify(sessionToken(userId, hash, secret), hash, "other-secret"));
  });

  it("is invalidated by a password change", () => {
    // This is what makes "changing your password signs every device out" true
    // without a session table: the hash is the signing key.
    assert.ok(!verify(sessionToken(userId, hash, secret), hashPassword("a-new-password")));
  });

  it("cannot be re-pointed at another user or a later issue time", () => {
    const parsed = parseSessionToken(sessionToken(userId, hash, secret));
    assert.ok(parsed);
    const other = "aaaaaaaa-1111-4222-8333-444455556666";
    assert.ok(!safeEqual(parsed.mac, sessionMac(other, parsed.issuedAt, hash, secret)));
    assert.ok(!safeEqual(parsed.mac, sessionMac(userId, parsed.issuedAt + 1, hash, secret)));
  });

  it("refuses to parse anything that is not one of its own tokens", () => {
    for (const bad of ["", "nope", "a.b.c", "abc.def.ghi.jkl", "jts1..123.mac", "jts1.u.notanumber.mac", "jts1.u.-5.mac"]) {
      assert.equal(parseSessionToken(bad), null, bad);
    }
  });

  it("expires after the maximum age, and rejects the future", () => {
    const now = Math.floor(Date.now() / 1000);
    assert.ok(!sessionExpired(now));
    assert.ok(!sessionExpired(now - 89 * 86_400));
    assert.ok(sessionExpired(now - 91 * 86_400));
    assert.ok(sessionExpired(now + 3600));
  });
});

describe("agent tokens", () => {
  it("are recognisable and distinct from session tokens", () => {
    const token = generateAgentToken();
    assert.ok(looksLikeAgentToken(token));
    assert.ok(!looksLikeAgentToken(sessionToken("u", "h", "s")));
  });

  it("hash deterministically, and differently per token", () => {
    const token = generateAgentToken();
    assert.equal(hashAgentToken(token), hashAgentToken(token));
    assert.notEqual(hashAgentToken(token), hashAgentToken(generateAgentToken()));
  });

  it("expose only a short prefix for display", () => {
    const token = generateAgentToken();
    const prefix = agentTokenPrefix(token);
    assert.ok(token.startsWith(prefix));
    assert.ok(prefix.length < token.length / 3, "prefix must not give away most of the token");
  });
});

describe("helpers", () => {
  it("normalizes email so one address is one account", () => {
    assert.equal(normalizeEmail("  Friend@Example.COM "), "friend@example.com");
  });

  it("validates email shape", () => {
    assert.ok(looksLikeEmail("a@b.co"));
    assert.ok(!looksLikeEmail("nope"));
    assert.ok(!looksLikeEmail("a b@c.com"));
    assert.ok(!looksLikeEmail(`${"x".repeat(320)}@y.com`));
  });

  it("compares unequal lengths without throwing", () => {
    assert.equal(safeEqual("a", "ab"), false);
    assert.equal(safeEqual("ab", "ab"), true);
  });
});
