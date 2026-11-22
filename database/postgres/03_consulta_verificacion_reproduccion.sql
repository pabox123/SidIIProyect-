
SELECT s.subscriptionId, s.planId, p.maxAgeRating
  FROM profiles p
  JOIN subscriptions s ON s.accountId = p.accountId
 WHERE p.profileId = :profileId
   AND p.accountId = :accountId
   AND p.isActive = 'Y'
   AND s.startsAt <= :now AND :now < s.endsAt;
