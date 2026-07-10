// ═══════════════════════════════════════════════════════════════
// @deprecated — Hardcoded badge images (fallback only)
// Badge images are now stored in Supabase Storage and served
// dynamically via API (card_image_url / icon_image_url).
// These static imports are kept as fallback during transition.
// ═══════════════════════════════════════════════════════════════
import ManhGhepHoanHaoCard from "@/assets/badgesCard/ManhGhepHoanHaoCard.png";
import ChienBinhOnboardingCard from "@/assets/badgesCard/ChienBinhOnboardingCard.png";
import NguoiNamGiuGiaTriCard from "@/assets/badgesCard/NguoiNamGiuGiaTriCard.png";
import DaiSuLACard from "@/assets/badgesCard/DaiSuL&ACard.png";
import NguoiButPhaLACard from "@/assets/badgesCard/NguoiButPhaL&ACard.png";
import ChuyenGiaLACard from "@/assets/badgesCard/ChuyenGiaL&ACard.png";
import BacThayTuyenDungCard from "@/assets/badgesCard/BacThayTuyenDungCard.png";
import ChuyenGiaOTIFCard from "@/assets/badgesCard/ChuyenGiaOTIFCard.png";
import DaiSuTinCayCard from "@/assets/badgesCard/DaiSuTinCayCard.png";
import BacThayToanNangCard from "@/assets/badgesCard/BacThayToanNangCard.png";
import HocGiaTocDoCard from "@/assets/badgesCard/HocGiaTocDoCard.png";
import NhaThamHiemHeThongCard from "@/assets/badgesCard/NhaThamHiemHeThongCard.png";
import NguoiDanDauCongNgheCard from "@/assets/badgesCard/NguoiDanDauCongNgheCard.png";

import ManhGhepHoanHaoMobileCard from "@/assets/badgesMobile/ManhGhepHoanHao.png";
import ChienBinhOnboardingMobileCard from "@/assets/badgesMobile/ChienBinhOnboarding.png";
import NguoiNamGiuGiaTriMobileCard from "@/assets/badgesMobile/NguoiNamGiuGiaTri.png";
import DaiSuLAMobileCard from "@/assets/badgesMobile/DaiSuL&A.png";
import NguoiButPhaLAMobileCard from "@/assets/badgesMobile/NguoiButPhaL&A.png";
import ChuyenGiaLAMobileCard from "@/assets/badgesMobile/ChuyenGiaL&A.png";
import BacThayTuyenDungMobileCard from "@/assets/badgesMobile/BacThayTuyenDung.png";
import ChuyenGiaOTIFMobileCard from "@/assets/badgesMobile/ChuyenGiaOTIF.png";
import DaiSuTinCayMobileCard from "@/assets/badgesMobile/DaiSuTinCay.png";
import BacThayToanNangMobileCard from "@/assets/badgesMobile/BacThayToanNang.png";
import HocGiaTocDoMobileCard from "@/assets/badgesMobile/HocGiaTocDo.png";
import NhaThamHiemHeThongMobileCard from "@/assets/badgesMobile/NhaThamHiemHeThong.png";
import NguoiDanDauCongNgheMobileCard from "@/assets/badgesMobile/NguoiDanDauCongNghe.png";

// Small Icons
import ManhGhepHoanHaoIcon from "@/assets/badges/ManhGhepHoanHao.png";
import ChienBinhOnboardingIcon from "@/assets/badges/ChienBinhOnboarding.png";
import NguoiNamGiuGiaTriIcon from "@/assets/badges/NguoiNamGiuGiaTri.png";
import DaiSuLAIcon from "@/assets/badges/DaiSuL&A.png";
import NguoiButPhaLAIcon from "@/assets/badges/NguoiButPhaL&A.png";
import ChuyenGiaLAIcon from "@/assets/badges/ChuyenGiaL&A.png";
import BacThayTuyenDungIcon from "@/assets/badges/BacThayTuyenDung.png";
import DaiSuTinCayIcon from "@/assets/badges/DaiSuTinCay.png";
import BacThayToanNangIcon from "@/assets/badges/BacThayToanNang.png";
import HocGiaTocDoIcon from "@/assets/badges/HocGiaTocDo.png";
import NhaThamHiemHeThongIcon from "@/assets/badges/NhaThamHiemHeThong.png";
import NguoiDanDauCongNgheIcon from "@/assets/badges/NguoiDanDauCongNghe.png";
import ChuyenGiaOTIF from "@/assets/badges/ChuyenGiaOTIF.png";

export const BADGE_CARD_IMAGES: Record<string, string> = {
  perfect_profile: ManhGhepHoanHaoCard,
  onboarding_warrior: ChienBinhOnboardingCard,
  value_holder: NguoiNamGiuGiaTriCard,
  la_ambassador: DaiSuLACard,
  la_breakthrough: NguoiButPhaLACard,
  la_expert: ChuyenGiaLACard,
  recruitment_master: BacThayTuyenDungCard,
  otif_expert: ChuyenGiaOTIFCard,
  trusted_ambassador: DaiSuTinCayCard,
  omnipotent_master: BacThayToanNangCard,
  speed_scholar: HocGiaTocDoCard,
  system_explorer: NhaThamHiemHeThongCard,
  first_step: NguoiDanDauCongNgheCard,
};

export const BADGE_MOBILE_CARD_IMAGES: Record<string, string> = {
  perfect_profile: ManhGhepHoanHaoMobileCard,
  onboarding_warrior: ChienBinhOnboardingMobileCard,
  value_holder: NguoiNamGiuGiaTriMobileCard,
  la_ambassador: DaiSuLAMobileCard,
  la_breakthrough: NguoiButPhaLAMobileCard,
  la_expert: ChuyenGiaLAMobileCard,
  recruitment_master: BacThayTuyenDungMobileCard,
  otif_expert: ChuyenGiaOTIFMobileCard,
  trusted_ambassador: DaiSuTinCayMobileCard,
  omnipotent_master: BacThayToanNangMobileCard,
  speed_scholar: HocGiaTocDoMobileCard,
  system_explorer: NhaThamHiemHeThongMobileCard,
  first_step: NguoiDanDauCongNgheMobileCard,
};
export const BADGE_ICONS: Record<string, string> = {
  perfect_profile: ManhGhepHoanHaoIcon,
  onboarding_warrior: ChienBinhOnboardingIcon,
  value_holder: NguoiNamGiuGiaTriIcon,
  la_ambassador: DaiSuLAIcon,
  la_breakthrough: NguoiButPhaLAIcon,
  la_expert: ChuyenGiaLAIcon,
  recruitment_master: BacThayTuyenDungIcon,
  otif_expert: ChuyenGiaOTIF,
  trusted_ambassador: DaiSuTinCayIcon,
  omnipotent_master: BacThayToanNangIcon,
  speed_scholar: HocGiaTocDoIcon,
  system_explorer: NhaThamHiemHeThongIcon,
  first_step: NguoiDanDauCongNgheIcon,
};
