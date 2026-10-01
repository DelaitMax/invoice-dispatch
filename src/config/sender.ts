import { env } from "./env";

export interface SenderAddress {
  readonly line1: string;
  readonly line2: string | undefined;
  readonly city: string;
  readonly postalCode: string | undefined;
  readonly country: string | undefined;
}

export interface SenderProfile {
  readonly brand: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string | undefined;
  readonly address: SenderAddress;
}

export const senderProfile: SenderProfile = Object.freeze({
  brand: env.SENDER_BRAND,
  name: env.SENDER_NAME,
  email: env.SENDER_EMAIL,
  phone: env.SENDER_PHONE,
  address: Object.freeze({
    line1: env.SENDER_ADDRESS_LINE1,
    line2: env.SENDER_ADDRESS_LINE2,
    city: env.SENDER_CITY,
    postalCode: env.SENDER_POSTAL_CODE,
    country: env.SENDER_COUNTRY,
  }),
});
