import type { User } from "../../src/domain/user.js";

export function buildUser(overrides: Partial<User> = {}): User {
  return {
    gender: "female",
    name: { title: "Ms", first: "Jane", last: "Doe" },
    location: {
      street: { number: 1234, name: "Main Street" },
      city: "Charleston",
      state: "South Carolina",
      country: "United States",
      postcode: 29401,
      coordinates: { latitude: "32.7765", longitude: "-79.9311" },
      timezone: { offset: "-5:00", description: "Eastern Time (US & Canada)" },
    },
    email: "jane.doe@example.com",
    login: {
      uuid: "11111111-2222-3333-4444-555555555555",
      username: "janedoe",
      password: "secret",
      salt: "abcdefgh",
      md5: "md5hash",
      sha1: "sha1hash",
      sha256: "sha256hash",
    },
    dob: { date: "1985-05-20T10:00:00.000Z", age: 40 },
    registered: { date: "2010-01-01T10:00:00.000Z", age: 15 },
    phone: "(555) 555-1234",
    cell: "(555) 555-5678",
    id: { name: "SSN", value: "123-45-6789" },
    picture: {
      large: "https://randomuser.me/api/portraits/women/1.jpg",
      medium: "https://randomuser.me/api/portraits/med/women/1.jpg",
      thumbnail: "https://randomuser.me/api/portraits/thumb/women/1.jpg",
    },
    nat: "US",
    ...overrides,
  };
}

/** Shortcut for the fields the domain actually reads. */
export function userWith(fields: {
  age?: number;
  city?: string;
  gender?: string;
  country?: string;
}): User {
  const base = buildUser();
  return buildUser({
    gender: fields.gender ?? base.gender,
    dob: { ...base.dob, age: fields.age ?? base.dob.age },
    location: {
      ...base.location,
      city: fields.city ?? base.location.city,
      country: fields.country ?? base.location.country,
    },
  });
}
