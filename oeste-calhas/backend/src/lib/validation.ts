import { z } from "zod";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
// Remove caracteres de controle e < > ; o React já escapa na saída e o Prisma parametriza as queries.
const clean = (s: string) => s.replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim();
const text = (min: number, max: number) => z.string().max(max * 2).transform(clean).pipe(z.string().min(min).max(max));
const countrySchema = z.enum([
  "AG", "AR", "BB", "BS", "BZ", "BO", "BR", "CA", "CL", "CO", "CR", "CU", "DM", "DO",
  "EC", "SV", "GD", "GT", "GY", "HT", "HN", "JM", "MX", "NI", "PA", "PY", "PE", "KN",
  "LC", "VC", "SR", "TT", "US", "UY", "VE", "PT", "GB", "ES", "FR", "DE", "IT", "JP", "AU",
]);

export const bookingInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hour: z.number().int().min(0).max(23),
  name: z.string().max(160).transform(clean).pipe(z.string().min(3).max(80).regex(/^[A-Za-z]+(?: [A-Za-z]+)*$/)),
  country: countrySchema,
  phone: z.string().regex(/^\d{5,15}$/),
  address: text(8, 200),
  description: text(10, 600),
  website: z.string().max(200).optional(), // honeypot: humanos não preenchem
}).strict();

const normalizePhone = <T extends { phone: string; country: string }>(data: T, ctx: z.RefinementCtx) => {
  const phone = parsePhoneNumberFromString(data.phone, data.country as CountryCode);
  if (!phone?.isValid()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Número de telefone inválido." });
    return z.NEVER;
  }
  return { ...data, phone: phone.number };
};

export const bookingSchema = bookingInputSchema.transform(normalizePhone);
export const adminBookingSchema = bookingInputSchema.extend({
  email: z.string().email().max(254).optional().or(z.literal("")),
}).transform((data, ctx) => normalizePhone(data, ctx));

export const adminCustomerSchema = z.object({
  name: z.string().max(160).transform(clean).pipe(z.string().min(3).max(80).regex(/^[A-Za-z]+(?: [A-Za-z]+)*$/)),
  country: countrySchema,
  phone: z.string().regex(/^\d{5,15}$/),
  email: z.string().email().max(254).optional().or(z.literal("")),
  internalNotes: z.string().max(2000).optional(),
}).strict().transform((data, ctx) => normalizePhone(data, ctx));

export const statusSchema = z.object({ status: z.enum(["CONFIRMED", "IN_PROGRESS", "DONE", "CANCELLED", "NO_SHOW"]) }).strict();
