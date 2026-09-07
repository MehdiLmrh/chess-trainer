// Beta build switch. This file is the *only* difference in intent between the
// `main` and `beta` branches — every beta-specific behaviour is gated on `BETA`.
//
// Beta = repertoire-first (bundled PGNs from /repertoires), no sound effects,
// no debug tooling.
export const BETA = true
