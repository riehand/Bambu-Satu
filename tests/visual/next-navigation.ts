export function usePathname() {
  const view=new URLSearchParams(window.location.search).get("view") ?? "dashboard";
  return view === "questionnaire" ? "/participant/assessment/test" : view === "introduction" ? "/participant/assessment" : view === "results" ? "/participant/assessment/test/results" : `/participant/${view}`;
}
export function useRouter() { return {
  push: (path:string)=>{window.history.pushState({},"",path);},
  replace: (path:string)=>{window.history.replaceState({},"",path);},
  refresh: ()=>{},
}; }
