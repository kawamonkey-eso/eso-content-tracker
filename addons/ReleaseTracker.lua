local provider = LibNotification:CreateProvider()
local declined

local function UpdateNotifications()
	local function OnDecline(data)
		declined[data.id] = true
		UpdateNotifications()
	end

	local currentTimeStamp = GetTimeStamp()
	provider.notifications = {}

	for _, v in ipairs(releases) do
		if
			declined[v.id] == nil and
			GetDiffBetweenTimeStamps(currentTimeStamp, v.startDate) >= 0 and
			(v.endDate == nil or GetDiffBetweenTimeStamps(currentTimeStamp, v.endDate) < 0)
		then
			table.insert(
				provider.notifications,
				{
					id = v.id,
					dataType = NOTIFICATIONS_ALERT_DATA,
					secsSinceRequest = ZO_NormalizeSecondsSince(0),
					note = v.source,
					message = v.name,
					heading = "Content Releases",
					shortDisplayText = "Content Releases",
					texture = "/esoui/art/dailyloginrewards/dailyloginrewards_claimed_stamp.dds",
					keyboardDeclineCallback = OnDecline,
					gamepadDeclineCallback = OnDecline
				}
			)
		end
	end

	provider:UpdateNotifications()
end

SLASH_COMMANDS["/releases"] = function()
	local currentTimeStamp = GetTimeStamp()

	CHAT_ROUTER:AddSystemMessage("Content Releases")

	for _, v in ipairs(releases) do
		if v.endDate == nil or GetDiffBetweenTimeStamps(v.endDate, currentTimeStamp) > 0 then
			CHAT_ROUTER:AddSystemMessage(
				zo_strformat(
					v.endDate == nil and "<<1>> [<<3>>]\n<<2>>" or "<<1>> [<<3>> to <<4>>]\n<<2>>",
					v.name,
					v.source,
					GetDateStringFromTimestamp(v.startDate),
					GetDateStringFromTimestamp(v.endDate)
				)
			)
		end
	end
end

function Test()
	local currentTimeStamp = GetTimeStamp()

	for _, v in ipairs(releases) do
		local timeUntilStart = GetDiffBetweenTimeStamps(currentTimeStamp, v.startDate)

		d(timeUntilStart)

		-- TODO fix
		if timeUntilStart > 0 then
			d("ReleaseCheck" .. v.startDate)

			EVENT_MANAGER:RegisterForUpdate(
				"ReleaseCheck" .. v.startDate,
				timeUntilStart,
				function()
					EVENT_MANAGER:UnregisterForUpdate("ReleaseCheck" .. v.startDate)
					UpdateNotifications()
				end
			)
		end
	end
end

EVENT_MANAGER:RegisterForEvent(
	"ReleaseTracker",
	EVENT_ADD_ON_LOADED,
	function(_, addOnName)
		if("ReleaseTracker" ~= addOnName) then return end

		declined = ZO_SavedVars:NewAccountWide("ReleaseTracker", 1, nil, {})

		UpdateNotifications()

		local currentTimeStamp = GetTimeStamp()

		for _, v in ipairs(releases) do
			local timeUntilStart = GetDiffBetweenTimeStamps(currentTimeStamp, v.startDate)

			-- TODO fix
			if timeUntilStart > 0 then
				EVENT_MANAGER:RegisterForUpdate(
					"ReleaseCheck" .. v.startDate,
					timeUntilStart,
					function()
						EVENT_MANAGER:UnregisterForUpdate("ReleaseCheck" .. v.startDate)
						UpdateNotifications()
					end
				)
			end
		end
	end
)