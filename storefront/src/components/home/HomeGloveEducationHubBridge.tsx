import { HomeBridge } from "@/components/home/authority/HomeAuthorityPrimitives";
import { HomeGloveEducationHubClient } from "@/components/home/HomeGloveEducationHub";
import { fetchEducationHubCatalogCandidates } from "@/lib/education-hub/fetch-education-hub-candidates";

export async function HomeGloveEducationHubWithBridge() {
  const { candidates, catalogUnavailable } = await fetchEducationHubCatalogCandidates();

  return (
    <>
      <HomeGloveEducationHubClient catalogCandidates={candidates} catalogUnavailable={catalogUnavailable} />
      <HomeBridge variant="gray-to-dark" />
    </>
  );
}
