import type { ReactNode } from "react";
import { adminTableClass, adminTableWrapClass } from "./styles";

type Props = {
  children: ReactNode;
  className?: string;
};

export function AdminTable({ children, className = "" }: Props) {
  return (
    <div className={`${adminTableWrapClass} ${className}`}>
      <table className={adminTableClass}>{children}</table>
    </div>
  );
}
