"use client"

import * as React from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet"
import { Icon } from "@/components/ui/icon"

interface MobileDrawerProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
}

export function MobileDrawer({ isOpen, onClose, children }: MobileDrawerProps) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="left" className="w-[300px] p-0 border-r border-[#243647] bg-[#1a2632] [&>button]:hidden">
        <SheetHeader className="px-4 py-3 border-b border-white/10 flex flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-lg font-bold text-white">Menu</SheetTitle>
          {/* SheetClose is automatically handled by SheetContent, but we can add a custom close button if we want specific styling 
              However, SheetContent already includes a close button. We can hide the default one via CSS or keep it. 
              The previous implementation had a custom close button in the header. 
              Let's use the standard SheetClose as a child if we want to place it in the header explicitly, 
              or rely on the default one. 
              The default one is absolute positioned. Let's hide it and put ours in the header to match exact design.
          */}
          <SheetClose className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#1773cf]">
            <span className="sr-only">Close menu</span>
            <Icon name="close" className="h-6 w-6" />
          </SheetClose>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
            {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}
