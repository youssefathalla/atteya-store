import * as v from 'valibot';

const isoCountry = v.pipe(v.string(), v.trim(), v.toUpperCase(), v.regex(/^[A-Z]{2}$/));

export const VisitorLocationResponseSchema = v.object({
  country: v.nullable(isoCountry),
});

export type VisitorLocationResponse = v.InferOutput<typeof VisitorLocationResponseSchema>;

/** ipwho.is success payload (fields we use only). */
export const IpWhoCountrySchema = v.object({
  success: v.literal(true),
  country_code: isoCountry,
});
