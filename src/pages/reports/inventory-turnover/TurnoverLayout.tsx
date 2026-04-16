import { Outlet } from "react-router-dom";
import { TurnoverDataProvider } from "./TurnoverDataContext";

export default function TurnoverLayout() {
  return (
    <TurnoverDataProvider>
      <Outlet />
    </TurnoverDataProvider>
  );
}
