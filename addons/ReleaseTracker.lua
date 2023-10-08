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
			(v.type ~= "esoPlusFreebie" or IsESOPlusSubscriber()) and
			declined[v.id] == nil and
			GetDiffBetweenTimeStamps(v.startDate, currentTimeStamp) <= 0 and
			(v.endDate == nil or GetDiffBetweenTimeStamps(currentTimeStamp, v.endDate) < 0)
		then
			table.insert(
				provider.notifications,
				{
					id = v.id,
					dataType = NOTIFICATIONS_ALERT_DATA,
					secsSinceRequest = ZO_NormalizeSecondsSince(0),
					note = v.type == "esoPlusFreebie" and "Free in Crown Store with ESO+" or v.source,
					message = v.name,
					heading = "Content Releases",
					shortDisplayText = "Content Releases",
					texture = v.type == "esoPlusFreebie" and "/esoui/art/treeicons/gamepad/tutorial_idexicon_esoplus.dds" or "/esoui/art/dailyloginrewards/dailyloginrewards_claimed_stamp.dds",
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
		if
			(v.type ~= "esoPlusFreebie" or IsESOPlusSubscriber()) and
			(v.endDate == nil or GetDiffBetweenTimeStamps(currentTimeStamp, v.endDate) < 0)
		then
			if v.source then
				local achievementName = string.match(v.source, "achievement \"(.+)\"")

				if achievementName then
					for achievementId = 1, 9999 do
						if achievementName == GetAchievementName(achievementId) then
							v.source = string.gsub(v.source, achievementName, GetAchievementLink(achievementId))
							break
						end
					end
				end
			end

			CHAT_ROUTER:AddSystemMessage(
				zo_strformat(
					v.endDate == nil and "<<1>> [<<3>>]\n<<2>>" or "<<1>> [<<3>> to <<4>>]\n<<2>>",
					v.name,
					v.type == "esoPlusFreebie" and "Free in Crown Store with ESO+" or v.source,
					GetDateStringFromTimestamp(v.startDate),
					GetDateStringFromTimestamp(v.endDate)
				)
			)
		end
	end
end

EVENT_MANAGER:RegisterForEvent(
	"ReleaseTracker",
	EVENT_ADD_ON_LOADED,
	function(_, addOnName)
		if "ReleaseTracker" ~= addOnName then return end

		declined = ZO_SavedVars:NewAccountWide("ReleaseTracker", 1, nil, {})

		UpdateNotifications()

		local currentTimeStamp = GetTimeStamp()

		for _, v in ipairs(releases) do
			local timeUntilStart = GetDiffBetweenTimeStamps(v.startDate, currentTimeStamp)

			if timeUntilStart > 0 then
				EVENT_MANAGER:RegisterForUpdate(
					"ReleaseCheck" .. v.startDate,
					timeUntilStart * 1000,
					function()
						EVENT_MANAGER:UnregisterForUpdate("ReleaseCheck" .. v.startDate)
						UpdateNotifications()
					end
				)
			end
		end
	end
)