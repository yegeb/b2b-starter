import { MedusaContainer } from "@medusajs/framework";
import { DEFAULT_REGION_STORE_POLICIES } from "../utils/region-store-policies";
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createCollectionsWorkflow,
  createProductCategoriesWorkflow,
  createProductOptionsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createStoresWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";
import type { CreateProductsWorkflowInput } from "@medusajs/medusa/core-flows";

/**
 * Seeds the demo store: sales channel, publishable key, store, region, tax
 * regions, stock location, fulfillment, catalog and products.
 *
 * Medusa marks a migration script as finished only after it ran to the end.
 * After a failure or a killed process, the next `db:migrate` runs the whole
 * script again. Each step therefore looks for the record it creates, by its
 * natural key, and creates it only when it is missing. A retry then completes
 * the missing steps and does not duplicate the records of the failed run.
 */
export default async function initial_data_seed({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(
    ModuleRegistrationName.FULFILLMENT
  );

  const countries = ["gb", "de", "dk", "se", "fr", "es", "it"];

  /** Lists the records of an entity that match the filters. */
  const find = async <T extends { id: string }>(
    entity: string,
    filters: Record<string, unknown>,
    fields: string[] = ["id"]
  ): Promise<T[]> => {
    const { data } = await query.graph({ entity, fields, filters });
    return data as unknown as T[];
  };

  logger.info("Seeding store data...");
  let [defaultSalesChannel] = await find("sales_channel", {
    name: "Default Sales Channel",
  });
  if (!defaultSalesChannel) {
    ({
      result: [defaultSalesChannel],
    } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [
          {
            name: "Default Sales Channel",
            description: "Created by Medusa",
          },
        ],
      },
    }));
  }

  let [publishableApiKey] = await find<{
    id: string;
    sales_channels?: { id: string }[];
  }>("api_key", { title: "Default Publishable API Key", type: "publishable" }, [
    "id",
    "sales_channels.id",
  ]);
  if (!publishableApiKey) {
    ({
      result: [publishableApiKey],
    } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          {
            title: "Default Publishable API Key",
            type: "publishable",
            created_by: "",
          },
        ],
      },
    }));
  }

  if (
    !publishableApiKey.sales_channels?.some(
      (channel) => channel.id === defaultSalesChannel.id
    )
  ) {
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: {
        id: publishableApiKey.id,
        add: [defaultSalesChannel.id],
      },
    });
  }

  const [existingStore] = await find("store", { name: "Default Store" });
  if (!existingStore) {
    await createStoresWorkflow(container).run({
      input: {
        stores: [
          {
            name: "Default Store",
            supported_currencies: [
              {
                currency_code: "eur",
                is_default: true,
              },
              {
                currency_code: "usd",
                is_default: false,
              },
            ],
            default_sales_channel_id: defaultSalesChannel.id,
          },
        ],
      },
    });
  }

  logger.info("Seeding region data...");
  let [region] = await find("region", { name: "Europe" });
  if (!region) {
    ({
      result: [region],
    } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Europe",
            currency_code: "eur",
            countries,
            payment_providers: ["pp_system_default"],
            metadata: DEFAULT_REGION_STORE_POLICIES,
          },
        ],
      },
    }));
  }
  logger.info("Finished seeding regions.");

  logger.info("Seeding tax regions...");
  const existingTaxRegions = await find<{ id: string; country_code: string }>(
    "tax_region",
    { country_code: countries },
    ["id", "country_code"]
  );
  const missingTaxCountries = countries.filter(
    (country_code) =>
      !existingTaxRegions.some(
        (taxRegion) => taxRegion.country_code === country_code
      )
  );
  if (missingTaxCountries.length) {
    await createTaxRegionsWorkflow(container).run({
      input: missingTaxCountries.map((country_code) => ({
        country_code,
        provider_id: "tp_system",
      })),
    });
  }
  logger.info("Finished seeding tax regions.");

  logger.info("Seeding stock location data...");
  type StockLocation = {
    id: string;
    fulfillment_providers?: { id: string }[];
    fulfillment_sets?: { id: string }[];
    sales_channels?: { id: string }[];
  };
  const stockLocationFields = [
    "id",
    "fulfillment_providers.id",
    "fulfillment_sets.id",
    "sales_channels.id",
  ];
  let [stockLocation] = await find<StockLocation>(
    "stock_location",
    { name: "European Warehouse" },
    stockLocationFields
  );
  if (!stockLocation) {
    const { result: stockLocationResult } = await createStockLocationsWorkflow(
      container
    ).run({
      input: {
        locations: [
          {
            name: "European Warehouse",
            address: {
              city: "Copenhagen",
              country_code: "DK",
              address_1: "",
            },
          },
        ],
      },
    });
    stockLocation = stockLocationResult[0];
  }

  if (
    !stockLocation.fulfillment_providers?.some(
      (provider) => provider.id === "manual_manual"
    )
  ) {
    await link.create({
      [Modules.STOCK_LOCATION]: {
        stock_location_id: stockLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_provider_id: "manual_manual",
      },
    });
  }

  logger.info("Seeding fulfillment data...");
  let [shippingProfile] = await find("shipping_profile", {
    name: "Default",
    type: "default",
  });
  if (!shippingProfile) {
    const { result: shippingProfileResult } =
      await createShippingProfilesWorkflow(container).run({
        input: {
          data: [
            {
              name: "Default",
              type: "default",
            },
          ],
        },
      });
    shippingProfile = shippingProfileResult[0];
  }

  let [fulfillmentSet] = await find<{
    id: string;
    service_zones: { id: string }[];
  }>("fulfillment_set", { name: "European Warehouse delivery" }, [
    "id",
    "service_zones.id",
  ]);
  if (!fulfillmentSet) {
    fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
      name: "European Warehouse delivery",
      type: "shipping",
      service_zones: [
        {
          name: "Europe",
          geo_zones: countries.map((country_code) => ({
            country_code,
            type: "country" as const,
          })),
        },
      ],
    });
  }

  if (
    !stockLocation.fulfillment_sets?.some((set) => set.id === fulfillmentSet.id)
  ) {
    await link.create({
      [Modules.STOCK_LOCATION]: {
        stock_location_id: stockLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_set_id: fulfillmentSet.id,
      },
    });
  }

  const shippingOptionRules = [
    {
      attribute: "enabled_in_store",
      value: "true",
      operator: "eq" as const,
    },
    {
      attribute: "is_return",
      value: "false",
      operator: "eq" as const,
    },
  ];
  const shippingOptions = [
    {
      name: "Standard Shipping",
      price_type: "flat" as const,
      provider_id: "manual_manual",
      service_zone_id: fulfillmentSet.service_zones[0].id,
      shipping_profile_id: shippingProfile.id,
      type: {
        label: "Standard",
        description: "Ship in 2-3 days.",
        code: "standard",
      },
      prices: [
        {
          currency_code: "usd",
          amount: 10,
        },
        {
          currency_code: "eur",
          amount: 10,
        },
        {
          region_id: region.id,
          amount: 10,
        },
      ],
      rules: shippingOptionRules,
    },
    {
      name: "Express Shipping",
      price_type: "flat" as const,
      provider_id: "manual_manual",
      service_zone_id: fulfillmentSet.service_zones[0].id,
      shipping_profile_id: shippingProfile.id,
      type: {
        label: "Express",
        description: "Ship in 24 hours.",
        code: "express",
      },
      prices: [
        {
          currency_code: "usd",
          amount: 10,
        },
        {
          currency_code: "eur",
          amount: 10,
        },
        {
          region_id: region.id,
          amount: 10,
        },
      ],
      rules: shippingOptionRules,
    },
  ];
  const existingShippingOptions = await find<{ id: string; name: string }>(
    "shipping_option",
    { name: shippingOptions.map((option) => option.name) },
    ["id", "name"]
  );
  const missingShippingOptions = shippingOptions.filter(
    (option) =>
      !existingShippingOptions.some((existing) => existing.name === option.name)
  );
  if (missingShippingOptions.length) {
    await createShippingOptionsWorkflow(container).run({
      input: missingShippingOptions,
    });
  }
  logger.info("Finished seeding fulfillment data.");

  if (
    !stockLocation.sales_channels?.some(
      (channel) => channel.id === defaultSalesChannel.id
    )
  ) {
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: {
        id: stockLocation.id,
        add: [defaultSalesChannel.id],
      },
    });
  }
  logger.info("Finished seeding stock location data.");

  logger.info("Seeding product data...");
  let [collection] = await find("product_collection", { handle: "featured" });
  if (!collection) {
    ({
      result: [collection],
    } = await createCollectionsWorkflow(container).run({
      input: {
        collections: [
          {
            title: "Featured",
            handle: "featured",
          },
        ],
      },
    }));
  }

  const categories = ["Laptops", "Accessories", "Phones", "Monitors"];
  const categoryResult = await find<{ id: string; name: string }>(
    "product_category",
    { name: categories },
    ["id", "name"]
  );
  const missingCategories = categories.filter(
    (name) => !categoryResult.some((category) => category.name === name)
  );
  if (missingCategories.length) {
    const { result: created } = await createProductCategoriesWorkflow(
      container
    ).run({
      input: {
        product_categories: missingCategories.map((name) => ({
          name,
          is_active: true,
        })),
      },
    });
    categoryResult.push(...created);
  }

  type ProductOption = {
    id: string;
    title: string;
    values?: { id: string; value: string }[];
  };
  const optionDefinitions = [
    {
      title: "Storage",
      values: ["256 GB", "512 GB"],
    },
    {
      title: "Memory",
      values: ["256 GB", "512 GB"],
    },
    {
      title: "Color",
      values: ["Blue", "Red", "Black", "White", "Purple"],
    },
  ];
  const productOptions = await find<ProductOption>(
    "product_option",
    { title: optionDefinitions.map((option) => option.title) },
    ["id", "title", "values.id", "values.value"]
  );
  const missingOptions = optionDefinitions.filter(
    (definition) =>
      !productOptions.some((option) => option.title === definition.title)
  );
  if (missingOptions.length) {
    const { result: created } = await createProductOptionsWorkflow(
      container
    ).run({
      input: {
        product_options: missingOptions,
      },
    });
    productOptions.push(...created);
  }

  const storageOption = productOptions.find((o) => o.title === "Storage")!;
  const memoryOption = productOptions.find((o) => o.title === "Memory")!;
  const colorOption = productOptions.find((o) => o.title === "Color")!;

  const valueId = (option: ProductOption, value: string): string =>
    option.values!.find((v) => v.value === value)!.id;

  type ProductInput = CreateProductsWorkflowInput["products"][number];

  /** Creates the product unless a product with its title exists. */
  const ensureProduct = async (product: ProductInput) => {
    const [existing] = await find("product", { title: product.title });
    if (existing) {
      return;
    }
    await createProductsWorkflow(container).run({
      input: { products: [product] },
    });
  };

  await ensureProduct({
    title: '16" Ultra-Slim AI Laptop | 3K OLED | 1.1cm Thin | 6-Speaker Audio',
    collection_id: collection.id,
    category_ids: [categoryResult.find((cat) => cat.name === "Laptops")?.id!],
    description:
      "This ultra-thin 16-inch laptop is a sophisticated, high-performance machine for the new era of artificial intelligence. It has been completely redesigned from the inside out. The cabinet features an exquisite new ceramic-aluminum composite material in a range of nature-inspired colors. This material provides durability while completing the ultra-slim design and resisting the test of time. This innovative computer utilizes the latest AI-enhanced processor with quiet ambient cooling. It's designed to enrich your lifestyle on the go with an astonishingly thin 1.1cm chassis that houses an advanced 16-inch 3K OLED display and immersive six-speaker audio.",
    weight: 400,
    status: ProductStatus.PUBLISHED,
    images: [
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/laptop-front.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/laptop-side.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/laptop-top.png",
      },
    ],
    options: [
      {
        id: storageOption.id,
        value_ids: [
          valueId(storageOption, "256 GB"),
          valueId(storageOption, "512 GB"),
        ],
      },
      {
        id: colorOption.id,
        value_ids: [valueId(colorOption, "Blue"), valueId(colorOption, "Red")],
      },
    ],
    variants: [
      {
        title: "256 GB / Blue",
        sku: "256-BLUE",
        options: {
          Storage: "256 GB",
          Color: "Blue",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 1299,
            currency_code: "eur",
          },
          {
            amount: 1299,
            currency_code: "usd",
          },
        ],
      },
      {
        title: "512 GB / Red",
        sku: "512-RED",
        options: {
          Storage: "512 GB",
          Color: "Red",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 1259,
            currency_code: "eur",
          },
          {
            amount: 1259,
            currency_code: "usd",
          },
        ],
      },
    ],
    sales_channels: [{ id: defaultSalesChannel.id }],
  });

  await ensureProduct({
    title: "1080p HD Pro Webcam | Superior Video | Privacy enabled",
    category_ids: [
      categoryResult.find((cat) => cat.name === "Accessories")?.id!,
    ],
    description:
      "High-quality 1080p HD webcam that elevates your work environment with superior video and audio that outperforms standard laptop cameras. Achieve top-tier video collaboration at a cost-effective price point, ideal for widespread deployment across your organization.",
    weight: 400,
    status: ProductStatus.PUBLISHED,
    images: [
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/camera-front.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/camera-side.png",
      },
    ],
    options: [
      {
        id: colorOption.id,
        value_ids: [
          valueId(colorOption, "Black"),
          valueId(colorOption, "White"),
        ],
      },
    ],
    variants: [
      {
        title: "Webcam Black",
        sku: "WEBCAM-BLACK",
        options: {
          Color: "Black",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 59,
            currency_code: "eur",
          },
          {
            amount: 59,
            currency_code: "usd",
          },
        ],
      },
      {
        title: "Webcam White",
        sku: "WEBCAM-WHITE",
        options: {
          Color: "White",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 65,
            currency_code: "eur",
          },
          {
            amount: 65,
            currency_code: "usd",
          },
        ],
      },
    ],
    sales_channels: [{ id: defaultSalesChannel.id }],
  });

  await ensureProduct({
    title: `6.5" Ultra HD Smartphone | 3x Impact-Resistant Screen`,
    collection_id: collection.id,
    category_ids: [categoryResult.find((cat) => cat.name === "Phones")?.id!],
    description:
      'This premium smartphone is crafted from durable and lightweight aerospace-grade aluminum, featuring an expansive 6.5" Ultra-High Definition AMOLED display. It boasts exceptional durability with a cutting-edge nanocrystal glass front, offering three times the impact resistance of standard smartphone screens. The device combines sleek design with robust protection, setting a new standard for smartphone resilience and visual excellence. Copy',
    weight: 400,
    status: ProductStatus.PUBLISHED,
    images: [
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/phone-front.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/phone-side.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/phone-bottom.png",
      },
    ],
    options: [
      {
        id: memoryOption.id,
        value_ids: [
          valueId(memoryOption, "256 GB"),
          valueId(memoryOption, "512 GB"),
        ],
      },
      {
        id: colorOption.id,
        value_ids: [
          valueId(colorOption, "Purple"),
          valueId(colorOption, "Red"),
        ],
      },
    ],
    variants: [
      {
        title: "256 GB Purple",
        sku: "PHONE-256-PURPLE",
        options: {
          Memory: "256 GB",
          Color: "Purple",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 999,
            currency_code: "eur",
          },
          {
            amount: 999,
            currency_code: "usd",
          },
        ],
      },
      {
        title: "256 GB Red",
        sku: "PHONE-256-RED",
        options: {
          Memory: "256 GB",
          Color: "Red",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 959,
            currency_code: "eur",
          },
          {
            amount: 959,
            currency_code: "usd",
          },
        ],
      },
    ],
    sales_channels: [{ id: defaultSalesChannel.id }],
  });

  await ensureProduct({
    title: `34" QD-OLED Curved Gaming Monitor | Ultra-Wide | Infinite Contrast | 175Hz`,
    collection_id: collection.id,
    category_ids: [categoryResult.find((cat) => cat.name === "Monitors")?.id!],
    description:
      "Experience the pinnacle of display technology with this 34-inch curved monitor. By merging OLED panels and Quantum Dot technology, this QD-OLED screen delivers exceptional contrast, deep blacks, unlimited viewing angles, and vivid colors. The curved design provides an immersive experience, allowing you to enjoy the best of both worlds in one cutting-edge display. This innovative monitor represents the ultimate fusion of visual performance and immersive design.",
    weight: 400,
    status: ProductStatus.PUBLISHED,
    images: [
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/screen-front.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/screen-side.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/screen-top.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/screen-back.png",
      },
    ],
    options: [
      {
        id: colorOption.id,
        value_ids: [
          valueId(colorOption, "White"),
          valueId(colorOption, "Black"),
        ],
      },
    ],
    variants: [
      {
        title: "ACME Monitor 4k White",
        sku: "ACME-MONITOR-WHITE",
        options: {
          Color: "White",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 599,
            currency_code: "eur",
          },
          {
            amount: 599,
            currency_code: "usd",
          },
        ],
      },
      {
        title: "ACME Monitor 4k White",
        sku: "ACME-MONITOR-BLACK",
        options: {
          Color: "Black",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 599,
            currency_code: "eur",
          },
          {
            amount: 599,
            currency_code: "usd",
          },
        ],
      },
    ],
    sales_channels: [{ id: defaultSalesChannel.id }],
  });

  await ensureProduct({
    title: "Hi-Fi Gaming Headset | Pro-Grade DAC | Hi-Res Certified",
    collection_id: collection.id,
    category_ids: [
      categoryResult.find((cat) => cat.name === "Accessories")?.id!,
    ],
    description: `Experience studio-quality audio with this advanced acoustic system, which pairs premium hardware with high-fidelity sound and innovative audio software for an immersive listening experience. The integrated digital-to-analog converter (DAC) enhances the audio setup with high-resolution certification and a built-in amplifier, delivering exceptional sound clarity and depth. This comprehensive audio solution brings professional-grade sound to your personal environment, whether for gaming, music production, or general entertainment.`,
    weight: 400,
    status: ProductStatus.PUBLISHED,
    images: [
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/headphone-front.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/headphone-side.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/headphone-top.png",
      },
    ],
    options: [
      {
        id: colorOption.id,
        value_ids: [
          valueId(colorOption, "Black"),
          valueId(colorOption, "White"),
        ],
      },
    ],
    variants: [
      {
        title: "Headphone Black",
        sku: "HEADPHONE-BLACK",
        options: {
          Color: "Black",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 149,
            currency_code: "eur",
          },
          {
            amount: 149,
            currency_code: "usd",
          },
        ],
      },
      {
        title: "Headphone White",
        sku: "HEADPHONE-WHITE",
        options: {
          Color: "White",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 149,
            currency_code: "eur",
          },
          {
            amount: 149,
            currency_code: "usd",
          },
        ],
      },
    ],
    sales_channels: [{ id: defaultSalesChannel.id }],
  });

  await ensureProduct({
    title: "Wireless Keyboard | Touch ID | Numeric Keypad",
    category_ids: [
      categoryResult.find((cat) => cat.name === "Accessories")?.id!,
    ],
    description: `This wireless keyboard offers a comfortable typing experience with a numeric keypad and Touch ID. It features navigation buttons, full-sized arrow keys, and is ideal for spreadsheets and gaming. The rechargeable battery lasts about a month. It pairs automatically with compatible computers and includes a USB-C to Lightning cable for charging and pairing.`,
    weight: 400,
    status: ProductStatus.PUBLISHED,
    images: [
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/keyboard-front.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/keyboard-side.png",
      },
    ],
    options: [
      {
        id: colorOption.id,
        value_ids: [
          valueId(colorOption, "Black"),
          valueId(colorOption, "White"),
        ],
      },
    ],
    variants: [
      {
        title: "Keyboard Black",
        sku: "KEYBOARD-BLACK",
        options: {
          Color: "Black",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 99,
            currency_code: "eur",
          },
          {
            amount: 99,
            currency_code: "usd",
          },
        ],
      },
      {
        title: "Keyboard White",
        sku: "KEYBOARD-WHITE",
        options: {
          Color: "White",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 99,
            currency_code: "eur",
          },
          {
            amount: 99,
            currency_code: "usd",
          },
        ],
      },
    ],
    sales_channels: [{ id: defaultSalesChannel.id }],
  });

  await ensureProduct({
    title: "Wireless Rechargeable Mouse | Multi-Touch Surface",
    category_ids: [
      categoryResult.find((cat) => cat.name === "Accessories")?.id!,
    ],
    description: `This wireless keyboard offers a comfortable typing experience with a numeric keypad and Touch ID. It features navigation buttons, full-sized arrow keys, and is ideal for spreadsheets and gaming. The rechargeable battery lasts about a month. It pairs automatically with compatible computers and includes a USB-C to Lightning cable for charging and pairing.`,
    weight: 400,
    status: ProductStatus.PUBLISHED,
    images: [
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/mouse-top.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/mouse-front.png",
      },
    ],
    options: [
      {
        id: colorOption.id,
        value_ids: [
          valueId(colorOption, "Black"),
          valueId(colorOption, "White"),
        ],
      },
    ],
    variants: [
      {
        title: "Mouse Black",
        sku: "MOUSE-BLACK",
        options: {
          Color: "Black",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 79,
            currency_code: "eur",
          },
          {
            amount: 79,
            currency_code: "usd",
          },
        ],
      },
      {
        title: "Mouse White",
        sku: "MOUSE-WHITE",
        options: {
          Color: "White",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 79,
            currency_code: "eur",
          },
          {
            amount: 79,
            currency_code: "usd",
          },
        ],
      },
    ],
    sales_channels: [{ id: defaultSalesChannel.id }],
  });

  await ensureProduct({
    title: "Conference Speaker | High-Performance | Budget-Friendly",
    category_ids: [
      categoryResult.find((cat) => cat.name === "Accessories")?.id!,
    ],
    description: `This compact, powerful conference speaker offers exceptional, high-performance features at a surprisingly affordable price. Packed with advanced productivity-enhancing technology, it delivers premium functionality without the premium price tag. Experience better meetings and improved communication, regardless of where your team members are calling from.`,
    weight: 400,
    status: ProductStatus.PUBLISHED,
    images: [
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/speaker-top.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/speaker-front.png",
      },
    ],
    options: [
      {
        id: colorOption.id,
        value_ids: [
          valueId(colorOption, "Black"),
          valueId(colorOption, "White"),
        ],
      },
    ],
    variants: [
      {
        title: "Speaker Black",
        sku: "SPEAKER-BLACK",
        options: {
          Color: "Black",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 79,
            currency_code: "eur",
          },
          {
            amount: 79,
            currency_code: "usd",
          },
        ],
      },
      {
        title: "Speaker White",
        sku: "SPEAKER-WHITE",
        options: {
          Color: "White",
        },
        manage_inventory: false,
        prices: [
          {
            amount: 55,
            currency_code: "eur",
          },
          {
            amount: 55,
            currency_code: "usd",
          },
        ],
      },
    ],
    sales_channels: [{ id: defaultSalesChannel.id }],
  });

  logger.info("Finished seeding product data.");
}
