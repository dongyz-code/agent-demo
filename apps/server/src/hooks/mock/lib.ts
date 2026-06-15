import { Faker, zh_CN, en, base } from '@faker-js/faker';

export const faker = new Faker({
  locale: [zh_CN, en, base],
});
