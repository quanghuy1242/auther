"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/modal"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Icon } from "@/components/ui/icon"
import { getAllUsers } from "@/app/admin/users/actions"
import { getAllGroups } from "@/app/admin/clients/[id]/access/actions"

export interface User {
  id: string
  name: string | null
  email: string
  image?: string | null
}

export interface Group {
  id: string
  name: string
  memberCount: number
}

export interface UserGroupPickerProps {
  isOpen: boolean
  onClose: () => void
  type: "user" | "group"
  onSelect: (selected: User | Group) => void
  excludeIds?: string[]
  title?: string
}

/**
 * User/Group Picker modal component for selecting users or groups
 * Uses Command primitive for accessible searching and filtering
 */
export function UserGroupPicker({
  isOpen,
  onClose,
  type,
  onSelect,
  excludeIds = [],
  title,
}: UserGroupPickerProps) {
  const [items, setItems] = React.useState<(User | Group)[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!isOpen) return

    const loadData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        if (type === "user") {
          const fetchedUsers = await getAllUsers()
          setItems(fetchedUsers as User[])
        } else {
          const fetchedGroups = await getAllGroups()
          setItems(fetchedGroups)
        }
      } catch (err) {
        console.error("Failed to load data:", err)
        setError("Failed to load data. Please try again.")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [isOpen, type])

  const filteredItems = items.filter((item) => !excludeIds.includes(item.id))
  const modalTitle = title || (type === "user" ? "Add User" : "Add Group")

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-0 p-0 outline-none max-w-[450px]">
        <DialogHeader className="px-4 pb-4 pt-5">
          <DialogTitle>{modalTitle}</DialogTitle>
        </DialogHeader>
        <Command className="overflow-hidden rounded-t-none border-t border-slate-700 bg-transparent">
          <CommandInput placeholder={`Search ${type === "user" ? "users" : "groups"}...`} />
          <CommandList className="max-h-[350px] p-2">
            {loading && (
              <div className="py-6 text-center text-sm text-muted-foreground text-gray-400">
                Loading {type === "user" ? "users" : "groups"}...
              </div>
            )}
            {error && (
              <div className="py-6 text-center text-sm text-red-400">
                {error}
              </div>
            )}
            {!loading && !error && (
              <>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup heading={type === "user" ? "Users" : "Groups"}>
                  {filteredItems.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.name || (item as User).email || ""}
                  onSelect={() => {
                    onSelect(item)
                    onClose()
                  }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-hover-primary aria-selected:bg-hover-primary"
                >
                      {type === "user" ? (
                        <>
                          <div
                            className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-8 shrink-0"
                            style={{
                              backgroundImage: `url(${(item as User).image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.name}`})`,
                            }}
                          />
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="font-medium text-white truncate">
                              {item.name}
                            </span>
                            <span className="text-xs text-gray-400 truncate">
                              {(item as User).email}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-center rounded-full size-8 bg-slate-700 text-slate-400 shrink-0">
                            <Icon name="group" className="text-lg" />
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="font-medium text-white truncate">
                              {item.name}
                            </span>
                            <span className="text-xs text-gray-400">
                              {(item as Group).memberCount} members
                            </span>
                          </div>
                        </>
                      )}
                      <Icon name="add" className="ml-auto text-gray-500" size="sm" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
