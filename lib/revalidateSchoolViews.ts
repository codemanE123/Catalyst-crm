import { revalidatePath } from "next/cache";

export function revalidateSchoolViews(schoolId?: string) {
  revalidatePath("/");

  if (schoolId) {
    revalidatePath(`/schools/${schoolId}`);
  }
}
