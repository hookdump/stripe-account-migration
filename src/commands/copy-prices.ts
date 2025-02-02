import { promises as fs } from "fs";
import { csvStringToMap, mapToCsvString } from "../core/csv";
import { createStripeClient } from "../core/stripe";
import { sanitizePrice } from "./sanitize/price";

export async function copyPrices(
  productsFilePath: string,
  pricesFilePath: string,
  apiKeyOldAccount: string,
  apiKeyNewAccount: string
) {
  const products = await csvStringToMap(
    await fs.readFile(productsFilePath, "utf8")
  );

  const keyMap = new Map();

  // https://stripe.com/docs/api/prices/list
  await createStripeClient(apiKeyOldAccount)
    .prices.list({
      limit: 100,
      expand: ["data.currency_options", "data.tiers"],
    })
    .autoPagingEach(async (oldPrice) => {
      console.log('Processing price: ', oldPrice.id);
      const newProductId = products.get(oldPrice.product as string);

      if (!newProductId) throw Error("No matching new product_id");

      const newPrice = await createStripeClient(apiKeyNewAccount).prices.create(
        sanitizePrice(oldPrice, newProductId)
      );

      keyMap.set(oldPrice.id, newPrice.id);

      // update default price
      const oldProduct = await createStripeClient(
        apiKeyOldAccount
      ).products.retrieve(oldPrice.product as string);

      if (oldProduct.default_price === oldPrice.id) {
        await createStripeClient(apiKeyNewAccount).products.update(
          newProductId,
          {
            default_price: newPrice.id,
          }
        );
      }

    });

  // Display output in console, just in case writing to file fails
  const output = await mapToCsvString(keyMap);
  console.log('Writing output to:', pricesFilePath);
  console.log('---------------------------');
  console.log(output);
  console.log('---------------------------');
  await fs.writeFile(pricesFilePath, output);
}
