import { redirect } from "next/navigation";

/**
 * Pipelines index page.
 * Redirects to the Editor tab by default.
 */
export default function PipelinesPage() {
    redirect("/admin/pipelines/editor");
}
