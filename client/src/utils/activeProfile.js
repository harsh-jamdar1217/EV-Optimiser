export const ACTIVE_PROFILE_KEY = 'ev_optimizer_active_profile';

export function getActiveProfile() {
  try {
    const raw = localStorage.getItem(ACTIVE_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveActiveProfile(profile) {
  if (!profile) {
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
    window.dispatchEvent(new Event('active-profile-change'));
    return null;
  }

  localStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event('active-profile-change'));
  return profile;
}
