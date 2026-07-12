export type NavigationItem = {
  label: string;
  icon?: string;
  to?: string;
  activePrefix?: string;
  visible?: boolean;
  disabled?: boolean;
  items?: NavigationItem[];
};
