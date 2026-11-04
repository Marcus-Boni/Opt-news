// In-app links run as View Transitions: the page cross-fades and a shared element (a story's headline) morphs into
// its place on the next page. Same props as React Router's; pass `viewTransition={false}` to opt out.
import { Link as RouterLink, NavLink as RouterNavLink, type LinkProps, type NavLinkProps } from "react-router";

export function Link(props: LinkProps) {
  return <RouterLink viewTransition {...props} />;
}

export function NavLink(props: NavLinkProps) {
  return <RouterNavLink viewTransition {...props} />;
}
