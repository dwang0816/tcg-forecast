import { redirect } from "next/navigation";

/**
 * Sealed products used to be a separate cross-game page. They now live inside
 * each game as a "Sealed Products" tab, which is where people actually look for
 * them. Kept as a redirect so old links don't 404.
 */
export default function ProductsPage() {
  redirect("/pokemon?kind=sealed&view=valuable");
}
