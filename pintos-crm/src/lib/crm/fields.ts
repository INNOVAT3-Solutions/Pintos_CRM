/**
 * Which GHL contact custom fields the customer profile shows, and in what groups.
 * Referenced by GHL `fieldKey` (stable) — ids and options are looked up from the
 * synced field definitions, so renaming options in GHL just works.
 * Fields that don't exist in GHL are skipped.
 */
export const PROFILE_FIELD_GROUPS: { title: string; keys: string[] }[] = [
  {
    title: "Customer",
    keys: [
      "contact.customer_type",
      "contact.customer_status",
      "contact.normalized_lead_source",
      "contact.preferred_contact_method",
    ],
  },
  {
    title: "Property",
    keys: [
      "contact.property_type",
      "contact.property_address",
      "contact.square_footage",
      "contact.stories",
      "contact.roof_type",
      "contact.surface_types",
      "contact.water_access",
      "contact.gate__access_information",
      "contact.property_details_notes",
    ],
  },
  {
    title: "Service",
    keys: [
      "contact.service_needed",
      "contact.service_type",
      "contact.stains__problems",
      "contact.customer_preferences",
    ],
  },
];

export const CUSTOMER_TYPE_KEY = "contact.customer_type";
export const PROPERTY_ADDRESS_KEY = "contact.property_address";

/** Field data types the profile form knows how to edit. */
export const EDITABLE_TYPES = new Set([
  "TEXT",
  "LARGE_TEXT",
  "NUMERICAL",
  "MONETORY",
  "SINGLE_OPTIONS",
  "RADIO",
  "MULTIPLE_OPTIONS",
  "CHECKBOX",
  "DATE",
  "PHONE",
  "EMAIL",
]);
