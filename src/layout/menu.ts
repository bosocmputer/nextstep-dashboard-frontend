export type NavigationItem = {
  label: string;
  icon?: string;
  to?: string;
  visible?: boolean;
  disabled?: boolean;
  items?: NavigationItem[];
};
