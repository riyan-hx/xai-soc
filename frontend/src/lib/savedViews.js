const KEY = "xai-soc-saved-views";

export function loadSavedViews() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(views) {
  try {
    localStorage.setItem(KEY, JSON.stringify(views));
  } catch {
    /* storage unavailable: the view just will not survive a reload */
  }
  return views;
}

export function saveView(name, filters) {
  const views = loadSavedViews().filter((v) => v.name !== name);
  views.push({ name, filters });
  return persist(views);
}

export function deleteView(name) {
  return persist(loadSavedViews().filter((v) => v.name !== name));
}
