// @ts-nocheck
import { createContext, useContext } from "react";

// Estado e funcoes do ScannerJuridico compartilhados com os blocos de tela (src/components).
export const AppContext = createContext<any>(null);
export const useApp = () => useContext(AppContext);
