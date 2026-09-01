// Five Australian natives, chosen for silhouette: a player has to tell them
// apart at a glance, as seeds and again in flower, without a word of labelling.
// Everything here is shape and colour — the rules in garden.ts don't know or
// care which species a plant is, so a new one is a data entry, not a branch.

export type SpeciesId =
  | "kangaroo-paw"
  | "banksia"
  | "bottlebrush"
  | "grevillea"
  | "wattle";

export interface Species {
  readonly id: SpeciesId;
  readonly name: string;
  /** Seed colour and rough size, for the seed sitting on the bench. */
  readonly seed: { readonly colour: number; readonly radius: number };
  readonly foliage: number;
  readonly bloom: number;
  /** Metres at full growth. Native beds are not all one height. */
  readonly height: number;
  readonly form: "strap" | "spike" | "brush" | "fine" | "phyllode";
}

export const SPECIES: readonly Species[] = [
  {
    id: "kangaroo-paw",
    name: "Kangaroo paw",
    seed: { colour: 0x2f2a22, radius: 0.011 },
    foliage: 0x5d7a4a,
    bloom: 0xc8452b,
    height: 0.72,
    form: "strap",
  },
  {
    id: "banksia",
    name: "Banksia",
    seed: { colour: 0x4a3526, radius: 0.016 },
    foliage: 0x4e6b47,
    bloom: 0xd8a838,
    height: 0.86,
    form: "spike",
  },
  {
    id: "bottlebrush",
    name: "Bottlebrush",
    seed: { colour: 0x3b3128, radius: 0.009 },
    foliage: 0x5a7d55,
    bloom: 0xc42f34,
    height: 0.8,
    form: "brush",
  },
  {
    id: "grevillea",
    name: "Grevillea",
    seed: { colour: 0x574230, radius: 0.01 },
    foliage: 0x6d8a63,
    bloom: 0xdc5a7a,
    height: 0.6,
    form: "fine",
  },
  {
    id: "wattle",
    name: "Wattle",
    seed: { colour: 0x241c14, radius: 0.008 },
    foliage: 0x6f8a5c,
    bloom: 0xe8c34a,
    height: 0.68,
    form: "phyllode",
  },
];

export function speciesOf(id: SpeciesId): Species {
  const found = SPECIES.find((s) => s.id === id);
  if (!found) throw new Error(`unknown species: ${id}`);
  return found;
}
