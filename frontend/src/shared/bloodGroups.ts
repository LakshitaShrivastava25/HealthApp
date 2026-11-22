/**
 * The blood groups offered wherever a profile is created or edited.
 *
 * Shared so the registration step and Add Family Member cannot drift apart:
 * both save these exact strings, and `''` means "not known" rather than a
 * group of its own.
 */
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
