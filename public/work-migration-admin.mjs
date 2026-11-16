// Retired: Work server migration actions are intentionally unavailable.
// Kept as a no-op export so historical imports cannot start the migration UI.
export async function mountWorkMigrationAdmin(target){
 if(target)target.replaceChildren();
}
